import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "../src/infrastructure/storage/file-storage.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalFileStorage", () => {
  it("archives files by category, year, and month", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "finance-storage-"));
    tempDirectories.push(root);
    const storage = new LocalFileStorage(root, () => new Date(2026, 6, 13, 10, 0, 0));
    const hash = "a".repeat(64);

    const saved = await storage.saveInvoiceImport("xml", hash, Buffer.from("invoice"));

    expect(saved).toEqual({ storagePath: `invoice/2026/07/${hash}.xml`, created: true });
    await expect(readFile(path.join(root, saved.storagePath), "utf8")).resolves.toBe("invoice");
  });
});
