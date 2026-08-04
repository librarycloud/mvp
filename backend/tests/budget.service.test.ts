import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { BudgetService } from "../src/modules/budget/budget.service.js";

const actor = { actorId: 1, role: "ADMIN" as const };

describe("BudgetService", () => {
  it("locks the matched budget line before calculating available funds", async () => {
    const tx = {
      budgetReservation: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal("20") } }),
        create: vi.fn().mockResolvedValue({ id: 9 }),
      },
      budgetLine: { findFirst: vi.fn().mockResolvedValue({ id: 3, amount: new Prisma.Decimal("100") }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 3 }]),
    } as any;
    const service = new BudgetService({} as any);

    await expect(service.reserveForReimbursement(tx, { id: 7, expenseDate: new Date("2026-07-01T00:00:00.000Z"), expenseType: "办公费", amount: new Prisma.Decimal("30") }, false)).resolves.toMatchObject({ configured: true, available: "80" });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.budgetLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ plan: expect.objectContaining({ activeFiscalYear: 2026 }) }) }));
  });

  it("does not allow an amount below active reservations and spending", async () => {
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 3 }]),
      budgetLine: { findUnique: vi.fn().mockResolvedValue({ id: 3, expenseType: "办公费", department: "", amount: new Prisma.Decimal("100") }), update },
      budgetReservation: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal("80") } }) },
    } as any;
    const service = new BudgetService({ $transaction: vi.fn(async (work) => work(tx)) } as any);

    await expect(service.updateLine(3, { amount: "70" }, actor)).rejects.toMatchObject({ code: "BUDGET_AMOUNT_BELOW_COMMITMENTS" });
    expect(update).not.toHaveBeenCalled();
  });
});
