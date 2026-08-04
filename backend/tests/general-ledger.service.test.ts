import { describe, expect, it } from "vitest";
import { GeneralLedgerService } from "../src/modules/general-ledger/general-ledger.service.js";
import { FakeGeneralLedgerRepository } from "./helpers/fake-general-ledger-repository.js";

const accountId = 701;

describe("GeneralLedgerService", () => {
  it("carries opening balance and rolls entries using Decimal arithmetic", async () => {
    const repository = new FakeGeneralLedgerRepository();
    repository.opening = { debit: "100.00", credit: "20.00" };
    repository.entries = [
      {
        voucherId: 1, voucherNo: "2026-000001", voucherDate: new Date(2026, 6, 1), sequenceNo: 1, lineNo: 1,
        summary: "收到款项", debitAmount: "0.1", creditAmount: "0",
      },
      {
        voucherId: 2, voucherNo: "2026-000002", voucherDate: new Date(2026, 6, 2), sequenceNo: 2, lineNo: 1,
        summary: "支付款项", debitAmount: "0", creditAmount: "80.3",
      },
    ];
    const result = await new GeneralLedgerService(repository).getLedger({
      accountId,
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
    });

    expect(result.opening).toEqual({ direction: "DEBIT", amount: "80" });
    expect(result.lines[0]).toMatchObject({ balanceDirection: "DEBIT", balance: "80.1" });
    expect(result.lines[1]).toMatchObject({ balanceDirection: "CREDIT", balance: "0.2" });
    expect(result).toMatchObject({ periodDebit: "0.1", periodCredit: "80.3", closing: { direction: "CREDIT", amount: "0.2" } });
  });

  it("returns a zero balance without an artificial direction", async () => {
    const repository = new FakeGeneralLedgerRepository();
    repository.opening = { debit: "10", credit: "10" };
    const result = await new GeneralLedgerService(repository).getLedger({
      accountId,
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
    });
    expect(result.opening).toEqual({ direction: null, amount: "0" });
    expect(result.closing).toEqual({ direction: null, amount: "0" });
  });

  it("rejects missing accounts and inverted date ranges", async () => {
    const repository = new FakeGeneralLedgerRepository();
    const service = new GeneralLedgerService(repository);
    await expect(
      service.getLedger({ accountId: 799, startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31) }),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.getLedger({ accountId, startDate: new Date(2026, 6, 31), endDate: new Date(2026, 6, 1) }),
    ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });
});
