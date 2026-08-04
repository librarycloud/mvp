import { afterEach, describe, expect, it, vi } from "vitest";
import { BankFileParser } from "../src/modules/bank-transaction/bank-file-parser.js";
import { BankTransactionService } from "../src/modules/bank-transaction/bank-transaction.service.js";
import { FakeBankTransactionRepository } from "./helpers/fake-bank-transaction-repository.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";

const csv = Buffer.from(
  [
    "\u4ea4\u6613\u91d1\u989d,\u4f59\u989d,\u4ea4\u6613\u65f6\u95f4,\u4ea4\u6613\u6d41\u6c34\u53f7,\u6458\u8981",
    "100.00,900.00,2026-07-01 10:00:00,TX-DUP,测试",
  ].join("\n"),
  "utf8",
);
const context = { actorId: 1 };

describe("BankTransactionService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skips a repeated transaction number on later imports", async () => {
    const repository = new FakeBankTransactionRepository();
    const storage = new MemoryFileStorage();
    const service = new BankTransactionService(repository, new BankFileParser(), storage);

    const first = await service.importFile({ originalName: "bank.csv", data: csv }, context);
    const second = await service.importFile({ originalName: "bank.csv", data: csv }, context);

    expect(first).toMatchObject({ successCount: 1, skippedCount: 0 });
    expect(second).toMatchObject({ successCount: 0, skippedCount: 1 });
  });

  it("removes the stored file when the database transaction fails", async () => {
    const repository = new FakeBankTransactionRepository();
    repository.failImport = true;
    const storage = new MemoryFileStorage();
    const service = new BankTransactionService(repository, new BankFileParser(), storage);

    await expect(service.importFile({ originalName: "bank.csv", data: csv }, context)).rejects.toThrow(
      "Database failure",
    );
    expect(storage.files.size).toBe(0);
    expect(storage.removed).toHaveLength(1);
  });

  it("does not remove a shared hash file created by an earlier import", async () => {
    const repository = new FakeBankTransactionRepository();
    const storage = new MemoryFileStorage();
    const service = new BankTransactionService(repository, new BankFileParser(), storage);
    await service.importFile({ originalName: "bank.csv", data: csv }, context);
    repository.failImport = true;

    await expect(service.importFile({ originalName: "bank.csv", data: csv }, context)).rejects.toThrow();
    expect(storage.files.size).toBe(1);
    expect(storage.removed).toEqual([]);
  });

  it("fetches all CMB continuation pages and imports them as one batch", async () => {
    const repository = new FakeBankTransactionRepository();
    const storage = new MemoryFileStorage();
    const client = {
      request: vi.fn()
        .mockResolvedValueOnce({ response: { body: {
          TRANSQUERYBYBREAKPOINT_Y1: [{ acctNbr: "TEST-CORPORATE-ACCOUNT", transDate: "20260730", expectNextSequence: "2" }],
          TRANSQUERYBYBREAKPOINT_Z1: [{ ctnFlag: "Y", queryAcctNbr: "TEST-CORPORATE-ACCOUNT" }],
          TRANSQUERYBYBREAKPOINT_Z2: [{ transDate: "20260730", transTime: "090000", transSequenceIdn: "TX-1", loanCode: "C", transAmount: "100", currencyNbr: "10", acctOnlineBal: "100" }],
        } } })
        .mockResolvedValueOnce({ response: { body: {
          TRANSQUERYBYBREAKPOINT_Y1: [{ acctNbr: "TEST-CORPORATE-ACCOUNT", transDate: "20260730", expectNextSequence: "3" }],
          TRANSQUERYBYBREAKPOINT_Z1: [{ ctnFlag: "N", queryAcctNbr: "TEST-CORPORATE-ACCOUNT" }],
          TRANSQUERYBYBREAKPOINT_Z2: [{ transDate: "20260730", transTime: "100000", transSequenceIdn: "TX-2", loanCode: "D", transAmount: "50", currencyNbr: "10", acctOnlineBal: "50" }],
        } } }),
    };
    const service = new BankTransactionService(repository, new BankFileParser(), storage, undefined, client as any);

    const result = await service.fetchAndImport({
      apiUrl: "https://cdc.cmbchina.com/api",
      userId: "U001",
      cardNbr: "TEST-CORPORATE-ACCOUNT",
      beginDate: "2026-07-30",
      endDate: "2026-07-30",
      privateKey: "private",
      bankPublicKey: "public",
      symKey: "1234567890123456",
    }, context);

    expect(result).toMatchObject({ totalCount: 2, successCount: 2 });
    expect(client.request).toHaveBeenCalledTimes(2);
    const firstRequest = client.request.mock.calls[0]?.[2];
    expect(firstRequest.TRANSQUERYBYBREAKPOINT_X1[0]).not.toHaveProperty("loanCode");
    const secondRequest = client.request.mock.calls[1]?.[2];
    expect(secondRequest.TRANSQUERYBYBREAKPOINT_X1[0].queryAcctNbr).toBe("TEST-CORPORATE-ACCOUNT");
    expect(secondRequest.TRANSQUERYBYBREAKPOINT_Y1).toHaveLength(1);
  });
});

