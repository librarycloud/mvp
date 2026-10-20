import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { PrismaPeriodCloseChecker } from "../src/modules/accounting-period/period-close-checker.js";

const period = {
  id: 7,
  year: 2026,
  month: 7,
  periodCode: "2026-07",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T00:00:00.000Z"),
  status: 0,
  closedAt: null,
  closedById: null,
};

function createChecker(assets: Array<{ originalValue: Prisma.Decimal; residualValue: Prisma.Decimal; accumulatedDepreciation: Prisma.Decimal; depreciationRecords: Array<{ status: number }> }>, reports = [{ template: { type: "BALANCE_SHEET" } }, { template: { type: "INCOME_STATEMENT" } }, { template: { type: "CASH_FLOW_STATEMENT" } }]) {
  const prisma = {
    voucher: { count: vi.fn().mockResolvedValue(0) },
    voucherEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0) } }) },
    bankTransaction: { count: vi.fn().mockResolvedValue(0) },
    bankReconciliation: { findMany: vi.fn().mockResolvedValue([]) },
    fixedAsset: { findMany: vi.fn().mockResolvedValue(assets) },
    employee: { count: vi.fn().mockResolvedValue(0) },
    salary: { count: vi.fn().mockResolvedValue(0) },
    reimbursement: { count: vi.fn().mockResolvedValue(0) },
    report: { findMany: vi.fn().mockResolvedValue(reports) },
  } as any;
  return { checker: new PrismaPeriodCloseChecker(prisma), findAssets: prisma.fixedAsset.findMany };
}

describe("PrismaPeriodCloseChecker depreciation", () => {
  it("does not require depreciation in an asset's start-use month", async () => {
    const { checker, findAssets } = createChecker([]);

    const result = await checker.inspect(period);

    expect(findAssets).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ startUseDate: { lt: period.startDate } }),
    }));
    expect(result.checks.find(check => check.code === "DEPRECIATION")).toMatchObject({ level: "PASS", count: 0 });
  });

  it("blocks closing when a depreciable asset from a previous month has no posted record", async () => {
    const { checker } = createChecker([{
      originalValue: new Prisma.Decimal("10000"),
      residualValue: new Prisma.Decimal("0"),
      accumulatedDepreciation: new Prisma.Decimal("0"),
      depreciationRecords: [],
    }]);

    const result = await checker.inspect(period);

    expect(result.checks.find(check => check.code === "DEPRECIATION")).toMatchObject({ level: "BLOCK", count: 1 });
  });

  it("does not require another record after an asset has been fully depreciated", async () => {
    const { checker } = createChecker([{
      originalValue: new Prisma.Decimal("10000"),
      residualValue: new Prisma.Decimal("1000"),
      accumulatedDepreciation: new Prisma.Decimal("9000"),
      depreciationRecords: [],
    }]);

    const result = await checker.inspect(period);

    expect(result.checks.find(check => check.code === "DEPRECIATION")).toMatchObject({ level: "PASS", count: 0 });
  });
});

describe("PrismaPeriodCloseChecker financial reports", () => {
  it("requires each primary report type instead of counting duplicate report records", async () => {
    const reports = ["BALANCE_SHEET", "INCOME_STATEMENT", "CUSTOM"].map(type => ({ template: { type } }));
    const { checker } = createChecker([], reports);

    const result = await checker.inspect(period);

    expect(result.checks.find(check => check.code === "REPORTS")).toMatchObject({ level: "BLOCK", count: 1, message: "尚缺：CASH_FLOW_STATEMENT" });
  });
});
