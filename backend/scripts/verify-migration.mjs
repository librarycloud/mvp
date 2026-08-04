import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "prisma", "models");
const migrationsDir = path.join(root, "prisma", "migrations");

const schemaFiles = (await readdir(schemaDir)).filter((name) => name.endsWith(".prisma"));
const schema = (
  await Promise.all(schemaFiles.map((name) => readFile(path.join(schemaDir, name), "utf8")))
).join("\n");
const migrationFolders = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const migration = (await Promise.all(migrationFolders.map((folder) => readFile(path.join(migrationsDir, folder, "migration.sql"), "utf8")))).join("\n");

const modelTables = new Set(
  [...schema.matchAll(/@@map\("([a-z0-9_]+)"\)/g)].map((match) => match[1]),
);
const modelByTable = new Map(
  [...schema.matchAll(/model\s+\w+\s*\{([\s\S]*?)\n\}/g)]
    .map((match) => [match[1].match(/@@map\("([a-z0-9_]+)"\)/)?.[1], match[1]])
    .filter(([table]) => table),
);
const tableBlocks = [...migration.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\)\s*(?:DEFAULT[^;]+)?;/g)];
const migrationTables = new Set(tableBlocks.map((match) => match[1]));
for (const match of migration.matchAll(/DROP TABLE(?: IF EXISTS)? `([^`]+)`/g)) {
  migrationTables.delete(match[1]);
}

assert.deepEqual(
  [...migrationTables].sort(),
  [...modelTables].sort(),
  "Migration table set differs from Prisma models",
);

for (const [tableName, body] of tableBlocks.map((match) => [match[1], match[2]]).filter(([tableName]) => migrationTables.has(tableName))) {
  const model = modelByTable.get(tableName);
  assert.ok(model, `Prisma model is missing for ${tableName}`);
  const standardFields = [["id", "id"], ["createdAt", "created_at"], ["updatedAt", "updated_at"], ["deletedAt", "deleted_at"]];
  for (const [field, column] of standardFields) {
    if (new RegExp(`^\\s*${field}\\s+`, "m").test(model)) {
      assert.match(body, new RegExp("`" + column + "`\\s"), `${tableName}.${column} is missing`);
    }
  }
  if (/^\s*id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/m.test(model)) {
    assert.match(body, /`id`\s+INTEGER UNSIGNED NOT NULL AUTO_INCREMENT/, `${tableName}.id must be an unsigned auto-increment integer`);
  }
  const status = body.match(/^\s*`status`\s+([^\r\n,]+)/m)?.[1];
  if (status && /^\s*status\s+Int(?:\s|$)/m.test(model)) {
    assert.match(status, /^TINYINT UNSIGNED NOT NULL/, `${tableName}.status must be numeric`);
  }
}

assert.doesNotMatch(migration, /\b(?:FLOAT|DOUBLE|REAL)\b/i, "Floating-point SQL type found");
assert.doesNotMatch(migration, /\bUUID\s*\(/i, "UUID generation found in migration");
assert.doesNotMatch(
  migration.replace(/`token_id`\s+CHAR\(36\)/gi, ""),
  /CHAR\(36\)/i,
  "UUID-sized database column found outside refresh token token_id",
);

const monetaryLines = migration
  .split(/\r?\n/)
  .filter((line) => /^\s+`(?:[a-z_]*(?:amount|balance|debit|credit)|coefficient|quantity|unit_price|tax_rate)`\s+[A-Z]/.test(line));
for (const line of monetaryLines) {
  assert.match(line, /\bDECIMAL\s*\(/i, `Non-decimal financial field: ${line.trim()}`);
}

const requiredFragments = [
  "bank_transactions_transaction_no_key",
  "invoices_seller_id_num_invoice_number_key",
  "vouchers_fiscal_year_sequence_no_key",
  "chk_voucher_balanced",
  "chk_voucher_entry_single_side",
  "chk_invoice_totals",
  "chk_report_period_dates",
];
for (const fragment of requiredFragments) {
  assert.ok(migration.includes(fragment), `Required constraint is missing: ${fragment}`);
}

console.log(`Migration verified: ${migrationTables.size} tables, ${requiredFragments.length} key constraints.`);
