import { describe, expect, it, vi } from "vitest";
import { DepreciationService } from "../src/modules/depreciation/depreciation.service.js";

describe("DepreciationService start period", () => {
  it("starts depreciation in the month after the asset start-use month", async () => {
    const period = {
      id: 8,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T00:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = {
      accountingPeriod: { findUnique: vi.fn().mockResolvedValue(period) },
      fixedAsset: { findMany },
    };
    const prisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as any;
    const periods = { assertVoucherOperation: vi.fn() } as any;
    const service = new DepreciationService(prisma, periods);

    await service.accrue(8, { accumulatedDepreciationAccountId: 1602 }, { actorId: 1, role: "ADMIN" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ startUseDate: { lt: period.startDate } }),
    }));
  });
});
