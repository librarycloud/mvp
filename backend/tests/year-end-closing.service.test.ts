import { describe, expect, it } from "vitest";
import { YearEndClosingService } from "../src/modules/year-end-closing/year-end-closing.service.js";
import { Prisma } from "../src/generated/prisma/client.js";

describe("YearEndClosingService", () => {
  const service = new YearEndClosingService({} as any);
  const user = { actorId: 1, role: "ACCOUNTANT" as const };
  it("rejects invalid fiscal years before querying data", async () => {
    await expect(service.preview(1999)).rejects.toMatchObject({ code: "INVALID_FISCAL_YEAR" });
  });
  it("only allows administrators to close a year", async () => {
    await expect(service.close(2026, { profitAccountId: 1 }, user)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires a reason to cancel a year-end closing", async () => {
    await expect(service.cancel(2026, "", { ...user, role: "ADMIN" })).rejects.toMatchObject({ code: "VOID_REASON_REQUIRED" });
  });
  it("keeps abnormal-direction balances and excludes existing year-end vouchers", async () => {
    let query: any;
    const prisma = { voucherEntry: { findMany: async (args: any) => { query = args; return [{ accountId: "income", debitAmount: new Prisma.Decimal("50"), creditAmount: new Prisma.Decimal("0"), account: { id: "income", code: "6001", name: "收入", category: "PROFIT_AND_LOSS", normalDirection: "CREDIT" } }]; } }, dictionaryItem: { findMany: async () => [] } };
    const result = await new YearEndClosingService(prisma as any).preview(2026);
    expect(result.lines[0]?.amount.toString()).toBe("50");
    expect(result.lines[0]?.closingDirection).toBe("CREDIT");
    expect(result.netProfit.toString()).toBe("-50");
    expect(query.where.voucher.accountingEvents.none.eventType).toBe("YEAR_END");
  });

  it("generates balanced closing voucher for monthly P&L", async () => {
    const mockVoucher = { id: 888 };
    const mockTx = {
      accountingPeriod: {
        findFirst: async () => ({ id: 10, year: 2026, month: 7, periodCode: "2026-07", status: 0, endDate: new Date("2026-07-31") }),
      },
      account: {
        findFirst: async () => ({ id: 4103, code: "4103", name: "本年利润" }),
      },
      voucherEntry: {
        findMany: async () => [
          { accountId: 6001, debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(1000), account: { id: 6001, code: "6001", name: "主营业务收入", category: "PROFIT_AND_LOSS", normalDirection: "CREDIT" } },
          { accountId: 6602, debitAmount: new Prisma.Decimal(400), creditAmount: new Prisma.Decimal(0), account: { id: 6602, code: "6602", name: "管理费用", category: "PROFIT_AND_LOSS", normalDirection: "DEBIT" } },
        ],
      },
      voucher: {
        create: async (data: any) => ({ ...mockVoucher, ...data.data }),
      },
      accountingEvent: {
        create: async () => ({ id: 1 }),
      },
      $executeRaw: async () => 1,
      $queryRaw: async () => [{ next_value: 1 }],
      voucherSequence: { update: async () => ({}) },
    };

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockTx),
    };

    const service = new YearEndClosingService(mockPrisma as any);
    const voucher = await service.closeMonthlyPnl(10, 4103, { actorId: 1, role: "ADMIN" });
    expect(voucher.id).toBe(888);
    expect(voucher.totalDebit.toString()).toBe("1400");
    expect(voucher.totalCredit.toString()).toBe("1400");
  });
});
