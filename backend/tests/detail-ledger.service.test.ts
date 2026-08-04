import { describe, expect, it } from "vitest";
import { DetailLedgerService } from "../src/modules/detail-ledger/detail-ledger.service.js";
import type { DetailLedgerEntry } from "../src/modules/detail-ledger/detail-ledger.types.js";
import { FakeDetailLedgerRepository } from "./helpers/fake-detail-ledger-repository.js";

const accountId = 701;
const entry = (overrides: Partial<DetailLedgerEntry>): DetailLedgerEntry => ({
  voucherId: 1, voucherNo: "2026-000001", voucherDate: new Date(2026, 6, 1), sequenceNo: 1,
  voucherSummary: "费用确认", lineNo: 1, entrySummary: "费用", debitAmount: "0", creditAmount: "0", dimensions: [],
  ...overrides,
});

describe("DetailLedgerService", () => {
  it("filters both opening and period balances by auxiliary data", async () => {
    const repository = new FakeDetailLedgerRepository();
    repository.before = [
      entry({ voucherId: 3, debitAmount: "100", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 1, memberCode: "ADMIN", memberName: "行政" }] }),
      entry({ voucherId: 4, debitAmount: "50", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 2, memberCode: "RND", memberName: "研发" }] }),
    ];
    repository.period = [
      entry({ voucherId: 5, debitAmount: "0.2", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 1, memberCode: "ADMIN", memberName: "行政" }] }),
      entry({ voucherId: 6, debitAmount: "0.1", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 2, memberCode: "RND", memberName: "研发" }] }),
    ];
    const result = await new DetailLedgerService(repository).getLedger({
      accountId, startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31),
      auxiliaryKey: "department", auxiliaryValue: "行政",
    });

    expect(result.opening).toEqual({ direction: "DEBIT", amount: "100" });
    expect(result.periodDebit).toBe("0.2");
    expect(result.closing).toEqual({ direction: "DEBIT", amount: "100.2" });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.voucherId).toBe(5);
  });

  it("returns all account detail when no auxiliary filter is present", async () => {
    const repository = new FakeDetailLedgerRepository();
    repository.period = [
      entry({ debitAmount: "0.1", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 1, memberCode: "ADMIN", memberName: "行政" }] }),
      entry({ voucherId: 2, debitAmount: "0.2", dimensions: [{ dimensionId: 1, dimensionCode: "DEPARTMENT", dimensionName: "部门", memberId: 2, memberCode: "RND", memberName: "研发" }] }),
    ];
    const result = await new DetailLedgerService(repository).getLedger({
      accountId, startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31),
    });
    expect(result.periodDebit).toBe("0.3");
    expect(result.lines).toHaveLength(2);
  });

  it("requires both auxiliary key and value", async () => {
    const service = new DetailLedgerService(new FakeDetailLedgerRepository());
    await expect(
      service.getLedger({ accountId, startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), auxiliaryKey: "department" }),
    ).rejects.toMatchObject({ code: "INVALID_AUXILIARY_FILTER" });
  });
});
