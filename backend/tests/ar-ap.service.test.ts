import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { ArApService } from "../src/modules/ar-ap/ar-ap.service.js";

const periods = { resolveOpenPeriod: vi.fn() } as any;
const actor = { actorId: 1, role: "ADMIN" as const };

describe("ArApService", () => {
  it("rejects invalid receivable amount before persisting", async () => {
    const service = new ArApService({} as any, periods);
    await expect(service.createDocument("receivable", { partyId: 1, documentNo: "AR-1", occurrenceDate: "2026-07-01", amount: "0" }, actor)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("rejects a due date earlier than its business date", async () => {
    const service = new ArApService({} as any, periods);
    await expect(service.createDocument("payable", { partyId: 1, documentNo: "AP-1", occurrenceDate: "2026-07-15", dueDate: "2026-07-01", amount: "10.00" }, actor)).rejects.toMatchObject({ code: "INVALID_DUE_DATE" });
  });

  it("calculates aging from unverified balances only", async () => {
    const service = new ArApService({} as any, periods);
    (service as any).listDocuments = async () => [
      { id: "1", documentNo: "AR-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("30"), occurrenceDate: new Date("2026-04-01"), dueDate: new Date("2026-04-15"), customer: { name: "客户甲" } },
      { id: "2", documentNo: "AR-2", amount: new Prisma.Decimal("50"), settledAmount: new Prisma.Decimal("50"), occurrenceDate: new Date("2026-04-01"), dueDate: null, customer: { name: "客户乙" } },
    ];
    const rows = await service.aging("receivable", new Date("2026-07-14T00:00:00.000Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ documentNo: "AR-1", bucket: "61-90", daysOverdue: 90 });
    expect(rows[0]?.outstanding.toString()).toBe("70");
  });

  it("suggests unlinked bank transactions with the same counterparty and outstanding amount", async () => {
    const bankTransaction = { findMany: vi.fn().mockResolvedValue([{ id: "bank-1", amount: new Prisma.Decimal("60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null }]) };
    const service = new ArApService({ receivable: { findFirst: vi.fn().mockResolvedValue({ id: "ar-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("40"), customer: { name: "客户甲" } }) }, bankTransaction, companyProfile: { findFirst: vi.fn().mockResolvedValue(null) } } as any, periods);
    const result = await service.bankMatches("receivable", 1);
    expect(result.outstanding.toString()).toBe("60");
    expect(result.matches.map((row) => row.id)).toEqual(["bank-1"]);
    expect(bankTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amount: { in: [new Prisma.Decimal("60"), new Prisma.Decimal("-60")] }, voucherId: null }) }));
  });

  it("suggests only outgoing bank transactions for a payable", async () => {
    const bankTransaction = { findMany: vi.fn().mockResolvedValue([
      { id: "out", amount: new Prisma.Decimal("-60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null },
      { id: "in", amount: new Prisma.Decimal("60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null },
    ]) };
    const service = new ArApService({ payable: { findFirst: vi.fn().mockResolvedValue({ id: "ap-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("40"), supplier: { name: "供应商甲" } }) }, bankTransaction, companyProfile: { findFirst: vi.fn().mockResolvedValue(null) } } as any, periods);

    const result = await service.bankMatches("payable", 1);

    expect(result.matches.map((row) => row.id)).toEqual(["out"]);
  });
});
