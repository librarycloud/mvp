import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { DeferredExpenseService } from "../src/modules/deferred-expense/deferred-expense.service.js";

describe("DeferredExpenseService", () => {
  const actor = { actorId: 1, role: "ACCOUNTANT" };

  it("registers long-term deferred expense card", async () => {
    let createdAsset: any = null;
    const tx = {
      fixedAsset: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          createdAsset = { id: 1, ...data };
          return createdAsset;
        },
        update: async () => createdAsset,
      },
      account: {
        findFirst: async () => ({ id: 6602, code: "6602", name: "管理费用" }),
      },
      accountingEvent: {
        create: async () => ({ id: 10 }),
      },
      auditLog: {
        create: async () => {},
      },
    };

    const prisma = { $transaction: async (work: any) => work(tx) } as any;
    const service = new DeferredExpenseService(prisma);

    const result = await service.create(
      {
        expenseNo: "LT-2026-001",
        name: "办公楼装修费",
        originalValue: "36000",
        usefulLifeMonths: 36,
        startDate: "2026-07-01",
      },
      actor,
    );

    expect(result.assetNo).toBe("LT-2026-001");
    expect(result.originalValue.toString()).toBe("36000");
    expect(result.usefulLifeMonths).toBe(36);
  });

  it("amortizes deferred expenses and generates vouchers", async () => {
    const period = {
      id: 7,
      periodCode: "2026-07",
      year: 2026,
      month: 7,
      endDate: new Date("2026-07-31"),
    };

    const tx = {
      accountingPeriod: {
        findUnique: async () => period,
      },
      fixedAsset: {
        findMany: async () => [
          {
            id: 1,
            assetNo: "LT-2026-001",
            name: "办公楼装修费",
            originalValue: new Prisma.Decimal("36000"),
            accumulatedDepreciation: new Prisma.Decimal("0"),
            usefulLifeMonths: 36,
            depreciationExpenseAccountId: 6602,
          },
        ],
        update: async () => {},
      },
      account: {
        findFirst: async ({ where }: any) => {
          const prefix = typeof where.code === "object" ? where.code?.startsWith : where.code;
          if (prefix?.startsWith?.("1801") || prefix === "1801") return { id: 1801, code: "1801", name: "长期待摊费用" };
          return { id: 6602, code: "6602", name: "管理费用" };
        },
      },
      depreciationRecord: {
        findUnique: async () => null,
        create: async () => ({ id: 1 }),
      },
      $executeRaw: async () => 1,
      $queryRaw: async () => [{ next_value: 1 }],
      voucherSequence: { update: async () => {} },
      voucher: {
        create: async ({ data }: any) => {
          // 36000 / 36 = 1000
          expect(data.totalDebit.toString()).toBe("1000");
          expect(data.entries.create).toHaveLength(2);
          expect(data.entries.create[0].accountId).toBe(6602);
          expect(data.entries.create[1].accountId).toBe(1801);
          return { id: 88, voucherNo: "2026-000088" };
        },
      },
      accountingEvent: {
        create: async () => ({ id: 11 }),
      },
    };

    const prisma = { $transaction: async (work: any) => work(tx) } as any;
    const service = new DeferredExpenseService(prisma);

    const result = await service.amortize(7, actor);
    expect(result.generatedCount).toBe(1);
    expect(result.generated[0]!.amount).toBe("1000");
    expect(result.generated[0]!.voucherNo).toBe("2026-000088");
  });
});
