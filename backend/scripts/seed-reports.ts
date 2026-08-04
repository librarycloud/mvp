import "dotenv/config";
import { loadConfig } from "../src/config/app-config.js";
import { createPrismaClient } from "../src/infrastructure/database/prisma.js";
import { BALANCE_SHEET_TEMPLATE } from "../src/modules/report/balance-sheet.template.js";
import { CASH_FLOW_TEMPLATE } from "../src/modules/report/cash-flow.template.js";
import { INCOME_STATEMENT_TEMPLATE } from "../src/modules/report/income-statement.template.js";
import { EQUITY_CHANGE_TEMPLATE } from "../src/modules/report/equity-change.template.js";
import {
  BALANCE_SHEET_TEMPLATE_CODE,
  CASH_FLOW_STATEMENT_TEMPLATE_CODE,
  INCOME_STATEMENT_TEMPLATE_CODE,
  EQUITY_CHANGE_STATEMENT_TEMPLATE_CODE,
} from "../src/modules/report/report.service.js";

type TemplateItem = {
  code: string;
  name: string;
  lineNumber: number;
  mappings?: Array<{
    accountCode: string;
    operator?: "ADD" | "SUBTRACT";
    valueType?: "PERIOD_DEBIT" | "PERIOD_CREDIT" | "PERIOD_NET" | "CLOSING_BALANCE" | "CASH_INFLOW" | "CASH_OUTFLOW";
    direction?: "DEBIT" | "CREDIT";
  }>;
  dependencies?: Array<{ sourceCode: string; operator: "ADD" | "SUBTRACT" }>;
};

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);

async function seedTemplate(input: {
  code: string;
  name: string;
    type: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW_STATEMENT" | "EQUITY_CHANGE_STATEMENT";
  description: string;
  items: TemplateItem[];
  version?: number;
}) {
  const version = input.version ?? (input.type === "CASH_FLOW_STATEMENT" ? 2 : 1);
  const existing = await prisma.reportTemplate.findUnique({ where: { code_version: { code: input.code, version } } });
  if (existing) {
    if (input.type === "CASH_FLOW_STATEMENT") {
      await prisma.reportTemplate.updateMany({ where: { code: input.code, version: { not: version }, isActive: true, deletedAt: null }, data: { isActive: false } });
      if (!existing.isActive) await prisma.reportTemplate.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    console.log(`${input.name} template already exists; no changes made.`);
    return;
  }
  const accountCodes = [...new Set(input.items.flatMap((item) => item.mappings?.map((mapping) => mapping.accountCode) ?? []))];
  const accounts = await prisma.account.findMany({ where: { code: { in: accountCodes }, deletedAt: null }, select: { id: true, code: true } });
  const accountIds = new Map(accounts.map((account) => [account.code, account.id]));
  const missing = accountCodes.filter((code) => !accountIds.has(code));
  if (missing.length) throw new Error(`Missing standard accounts: ${missing.join(", ")}`);
  await prisma.$transaction(async (tx) => {
    const template = await tx.reportTemplate.create({
      data: { code: input.code, name: input.name, type: input.type, version, isActive: true, description: input.description },
    });
    const itemIds = new Map<string, number>();
    for (const [index, item] of input.items.entries()) {
      const created = await tx.reportItem.create({
        data: {
          templateId: template.id, itemCode: item.code, name: item.name, lineNumber: item.lineNumber, sortOrder: index + 1,
          isSubtotal: Boolean(item.dependencies?.length), formula: item.dependencies?.map((dependency) => `${dependency.operator}(${dependency.sourceCode})`).join(" ") ?? null,
        },
      });
      itemIds.set(item.code, created.id);
      if (item.mappings?.length) {
        await tx.reportItemAccountMapping.createMany({
          data: item.mappings.map((mapping) => ({
            reportItemId: created.id, accountId: accountIds.get(mapping.accountCode)!, operator: mapping.operator ?? "ADD",
            valueType: mapping.valueType ?? "CLOSING_BALANCE", direction: mapping.direction ?? null, includeChildren: true,
          })),
        });
      }
    }
    for (const item of input.items) {
      if (!item.dependencies?.length) continue;
      await tx.reportFormulaDependency.createMany({
        data: item.dependencies.map((dependency, index) => ({
          targetItemId: itemIds.get(item.code)!, sourceItemId: itemIds.get(dependency.sourceCode)!,
          operator: dependency.operator, coefficient: "1", sortOrder: index + 1,
        })),
      });
    }
  });
  if (input.type === "CASH_FLOW_STATEMENT") await prisma.reportTemplate.updateMany({ where: { code: input.code, version: { not: version }, isActive: true, deletedAt: null }, data: { isActive: false } });
  console.log(`${input.name} template created.`);
}

try {
  await seedTemplate({
    code: INCOME_STATEMENT_TEMPLATE_CODE, name: "企业会计准则利润表", type: "INCOME_STATEMENT",
    description: "本期金额和本年累计金额", items: INCOME_STATEMENT_TEMPLATE,
  });
  await seedTemplate({
    code: EQUITY_CHANGE_STATEMENT_TEMPLATE_CODE, name: "企业会计准则所有者权益变动表", type: "EQUITY_CHANGE_STATEMENT",
    description: "本年及上年所有者权益各组成项目的年初余额与变动金额", items: EQUITY_CHANGE_TEMPLATE,
  });
  await seedTemplate({
    code: CASH_FLOW_STATEMENT_TEMPLATE_CODE, name: "企业会计准则现金流量表（直接法）", type: "CASH_FLOW_STATEMENT",
    description: "按已记账凭证现金及银行科目与对方科目归集的直接法现金流量", items: CASH_FLOW_TEMPLATE,
  });
  await seedTemplate({
    code: BALANCE_SHEET_TEMPLATE_CODE, name: "企业会计准则资产负债表", type: "BALANCE_SHEET",
    description: "期初余额和期末余额", items: BALANCE_SHEET_TEMPLATE,
  });
} finally {
  await prisma.$disconnect();
}
