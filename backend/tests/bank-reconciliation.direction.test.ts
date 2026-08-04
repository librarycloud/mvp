import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { BankReconciliationService } from "../src/modules/bank-reconciliation/bank-reconciliation.service.js";

describe("BankReconciliationService direction", () => {
  const service = new BankReconciliationService({} as never) as any;

  it("uses the amount sign when no company account is configured", () => {
    expect(service.transactionDirection({ amount: new Prisma.Decimal("100"), payerAccount: null, payeeAccount: null }, null)).toBe("INFLOW");
    expect(service.transactionDirection({ amount: new Prisma.Decimal("-100"), payerAccount: null, payeeAccount: null }, null)).toBe("OUTFLOW");
  });

  it("prefers payer and payee accounts when bank exports use unsigned amounts", () => {
    const amount = new Prisma.Decimal("100");
    expect(service.transactionDirection({ amount, payerAccount: "OTHER", payeeAccount: "6222 0001" }, "62220001")).toBe("INFLOW");
    expect(service.transactionDirection({ amount, payerAccount: "6222-0001", payeeAccount: "OTHER" }, "62220001")).toBe("OUTFLOW");
    expect(service.transactionDirection({ amount, payerAccount: "OTHER", payeeAccount: "OTHER" }, "62220001")).toBe("UNKNOWN");
  });

  it("maps bank-account debit entries to inflow and credit entries to outflow", () => {
    expect(service.entryDirection({ debitAmount: new Prisma.Decimal("100"), creditAmount: new Prisma.Decimal(0) })).toBe("INFLOW");
    expect(service.entryDirection({ debitAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal("100") })).toBe("OUTFLOW");
  });
});

describe("BankReconciliationService update", () => {
  function fixture(status = 0) {
    const row = {
      id: 7,
      status,
      bankAccountId: 3,
      statementOpeningBalance: new Prisma.Decimal("100"),
      statementClosingBalance: new Prisma.Decimal("200"),
      bookClosingBalance: new Prisma.Decimal("180"),
      difference: new Prisma.Decimal("20"),
      remark: "原备注",
      period: { endDate: new Date("2026-07-31T23:59:59.999Z") },
      bankAccount: { id: 3, code: "100201", name: "基本户" },
    };
    const prisma: any = {
      bankReconciliation: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn(async ({ data }) => ({ ...row, ...data })),
      },
      voucherEntry: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { debitAmount: new Prisma.Decimal("500"), creditAmount: new Prisma.Decimal("250") },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) => callback(prisma));
    return { row, prisma, service: new BankReconciliationService(prisma) };
  }

  it("updates editable balances and recalculates the difference", async () => {
    const { prisma, service } = fixture();
    const result = await service.update(
      7,
      { statementOpeningBalance: "110", statementClosingBalance: "275", remark: " 调整后 " },
      { actorId: 2, role: "ACCOUNTANT" },
    );

    expect(result.statementOpeningBalance.toString()).toBe("110");
    expect(result.statementClosingBalance.toString()).toBe("275");
    expect(result.bookClosingBalance.toString()).toBe("250");
    expect(result.difference.toString()).toBe("25");
    expect(result.remark).toBe("调整后");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "UPDATE", resourceType: "BankReconciliation", resourceId: 7 }) });
  });

  it("does not edit a completed reconciliation", async () => {
    const { service } = fixture(1);
    await expect(service.update(
      7,
      { statementOpeningBalance: "110", statementClosingBalance: "275", remark: "" },
      { actorId: 2, role: "ACCOUNTANT" },
    )).rejects.toMatchObject({ code: "BANK_RECONCILIATION_COMPLETED" });
  });
});
