import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { ReimbursementService } from "../src/modules/reimbursement/reimbursement.service.js";

const periods = { resolveOpenPeriod: vi.fn() } as any;

describe("ReimbursementService imported invoices", () => {
  it("paginates reimbursement lists and returns the total page count", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 51 }]);
    const count = vi.fn().mockResolvedValue(101);
    const prisma = {
      reimbursement: { findMany, count },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as any;
    const service = new ReimbursementService(prisma, periods);

    await expect(service.list({ page: 2, pageSize: 50, status: "1" })).resolves.toMatchObject({
      items: [{ id: 51 }],
      total: 101,
      page: 2,
      pageSize: 50,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 50 }));
  });

  it("lists only unposted purchase invoices that are available to the reimbursement", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReimbursementService({ invoice: { findMany } } as any, periods);

    await service.availableInvoices({ keyword: "京东", reimbursementId: 10 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        direction: "PURCHASE",
        voucherId: null,
        OR: [
          { reimbursementId: null },
          { reimbursementId: 10 },
        ],
      }),
    }));
  });

  it("lists unused bank transactions with either sign for the reimbursement amount", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReimbursementService({
      reimbursement: { findFirst: vi.fn().mockResolvedValue({ id: 10, amount: new Prisma.Decimal("5650") }) },
      bankTransaction: { findMany },
    } as any, periods);

    await service.availableBankTransactions(10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        voucherId: null,
        reimbursementPayment: null,
        amount: { in: [new Prisma.Decimal("5650"), new Prisma.Decimal("-5650")] },
      }),
    }));
  });

  it("rejects an imported invoice already reserved by another reimbursement", async () => {
    const service = new ReimbursementService({} as any, periods);
    const tx = { invoice: { findMany: vi.fn().mockResolvedValue([]) } };

    await expect((service as any).resolveInvoices(tx, [20]))
      .rejects.toMatchObject({ code: "REIMBURSEMENT_INVOICE_UNAVAILABLE", statusCode: 409 });
  });

  it("uses the imported tax-included amount for coverage without floating point arithmetic", async () => {
    const service = new ReimbursementService({} as any, periods);
    expect(() => (service as any).assertInvoiceCoverage(
      new Prisma.Decimal("1414.00"),
      [{ totalTaxIncludedAmount: new Prisma.Decimal("13.72") }, { totalTaxIncludedAmount: new Prisma.Decimal("1400.28") }],
    )).not.toThrow();
  });

  it("accepts only enabled reimbursement expense types from the dictionary", async () => {
    const findFirst = vi.fn().mockResolvedValue({ value: "办公费" });
    const service = new ReimbursementService({} as any, periods);

    await expect((service as any).resolveExpenseType(
      { dictionaryItem: { findFirst } },
      " 办公费 ",
    )).resolves.toBe("办公费");

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        value: "办公费",
        enabled: true,
        category: expect.objectContaining({ code: "reimbursement_expense_type", enabled: true }),
      }),
    }));
  });

  it("rejects expense types that are not enabled dictionary items", async () => {
    const service = new ReimbursementService({} as any, periods);
    const tx = { dictionaryItem: { findFirst: vi.fn().mockResolvedValue(null) } };

    await expect((service as any).resolveExpenseType(tx, "自定义费用"))
      .rejects.toMatchObject({ code: "INVALID_REIMBURSEMENT_EXPENSE_TYPE", statusCode: 400 });
  });

  it("normalizes full and partial input-tax deductions with Decimal values", () => {
    const service = new ReimbursementService({} as any, periods);
    const invoices = [
      { id: 1, invoiceNumber: "001", totalTaxAmount: new Prisma.Decimal("13.00") },
      { id: 2, invoiceNumber: "002", totalTaxAmount: new Prisma.Decimal("6.00") },
    ];
    const result = (service as any).normalizeTaxTreatments(invoices, [
      { invoiceId: 1, deductionStatus: 1, deductibleTaxAmount: "13.00" },
      { invoiceId: 2, deductionStatus: 3, deductibleTaxAmount: "2.50" },
    ]);

    expect(result.map((row: any) => [row.taxDeductionStatus, row.deductibleTaxAmount.toString()]))
      .toEqual([[1, "13"], [3, "2.5"]]);
  });

  it("blocks submission while tax treatment is unconfirmed", () => {
    const service = new ReimbursementService({} as any, periods);
    expect(() => (service as any).assertReadyForPosting(new Prisma.Decimal("113"), [{
      totalTaxAmount: new Prisma.Decimal("13"),
      totalTaxIncludedAmount: new Prisma.Decimal("113"),
      taxDeductionStatus: 0,
      deductibleTaxAmount: new Prisma.Decimal("0"),
    }])).toThrow(expect.objectContaining({ code: "INVOICE_TAX_TREATMENT_UNCONFIRMED" }));
  });

  it("returns an approved reimbursement to draft when it is edited", async () => {
    const current = {
      id: 4,
      status: 2,
      evidenceType: 0,
      evidenceDescription: null,
      createdById: 10,
      amount: new Prisma.Decimal("100"),
      invoices: [{ totalTaxIncludedAmount: new Prisma.Decimal("100") }],
    };
    const update = vi.fn().mockResolvedValue({ ...current, status: 0, description: "修改后" });
    const tx = { reimbursement: { update }, auditLog: { create: vi.fn() } };
    const prisma = {
      reimbursement: { findFirst: vi.fn().mockResolvedValue(current) },
      $transaction: (callback: (client: any) => unknown) => callback(tx),
    } as any;
    const service = new ReimbursementService(prisma, periods);

    await service.update(4, { description: "修改后" }, { actorId: 10, role: "ACCOUNTANT" });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 0,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectReason: null,
      }),
    }));
  });

  it("requires cancelling payment before editing a paid reimbursement", async () => {
    const service = new ReimbursementService({ reimbursement: { findFirst: vi.fn().mockResolvedValue({ id: 4, status: 4, evidenceType: 0, evidenceDescription: null, createdById: 10, invoices: [] }) } } as any, periods);

    await expect(service.update(4, { description: "修改后" }, { actorId: 10, role: "ACCOUNTANT" }))
      .rejects.toMatchObject({ code: "REIMBURSEMENT_NOT_EDITABLE", statusCode: 409 });
  });

  it("creates separate expense, input-tax and payment entries", async () => {
    const voucherCreate = vi.fn().mockResolvedValue({ id: 3 });
    const current = {
      id: 4,
      status: 2,
      evidenceType: 0,
      evidenceDescription: null,
      amount: new Prisma.Decimal("113.00"),
      applicantName: "张三",
      expenseType: "办公费",
      invoices: [{
        id: 1,
        invoiceNumber: "001",
        totalTaxAmount: new Prisma.Decimal("13.00"),
        totalTaxIncludedAmount: new Prisma.Decimal("113.00"),
        taxDeductionStatus: 1,
        deductibleTaxAmount: new Prisma.Decimal("13.00"),
      }],
    };
    const tx = {
      reimbursement: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({ ...current, status: 4 }),
      },
      account: { findMany: vi.fn().mockResolvedValue([{ id: 5, code: "6602" }, { id: 6, code: "22210101" }, { id: 7, code: "1002" }]) },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 1 }]),
      voucherSequence: { update: vi.fn() },
      voucher: { create: voucherCreate },
      accountingEvent: { create: vi.fn().mockResolvedValue({ id: 8 }) },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      voucherSource: { createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: (callback: (client: any) => unknown) => callback(tx) } as any;
    const periodResolver = { resolveOpenPeriod: vi.fn().mockResolvedValue({ id: 9, year: 2026, month: 7 }) } as any;
    const service = new ReimbursementService(prisma, periodResolver);

    await service.pay(4, {
      paymentDate: "2026-07-27",
      expenseAccountId: 5,
      inputTaxAccountId: 6,
      paymentAccountId: 7,
    }, { actorId: 10, role: "ADMIN" });

    const entries = voucherCreate.mock.calls[0]![0].data.entries.create;
    expect(entries.map((row: any) => [row.accountId, row.debitAmount.toString(), row.creditAmount.toString()]))
      .toEqual([[5, "100", "0"], [6, "13", "0"], [7, "0", "113"]]);
  });

  it("requires an explanation and rejects invoice data for no-invoice reimbursements", () => {
    const service = new ReimbursementService({} as any, periods);

    expect(() => (service as any).assertEvidenceSelection(2, "", [], []))
      .toThrow(expect.objectContaining({ code: "REIMBURSEMENT_EVIDENCE_DESCRIPTION_REQUIRED" }));
    expect(() => (service as any).assertEvidenceSelection(2, "供应商无法开票", [1], []))
      .toThrow(expect.objectContaining({ code: "INVALID_REIMBURSEMENT_EVIDENCE" }));
    expect(() => (service as any).assertEvidenceSelection(2, "供应商无法开票", [], []))
      .not.toThrow();
  });

  it("requires at least one supporting attachment for non-invoice reimbursements", () => {
    const service = new ReimbursementService({} as any, periods);
    expect(() => (service as any).assertSupportingAttachment(0))
      .toThrow(expect.objectContaining({ code: "REIMBURSEMENT_ATTACHMENT_REQUIRED" }));
    expect(() => (service as any).assertSupportingAttachment(1)).not.toThrow();
  });

  it("posts a no-invoice reimbursement without an input-tax entry", async () => {
    const voucherCreate = vi.fn().mockResolvedValue({ id: 13 });
    const current = {
      id: 14,
      status: 2,
      evidenceType: 2,
      evidenceDescription: "临时停车，收款方无法开票",
      amount: new Prisma.Decimal("30.00"),
      applicantName: "张三",
      expenseType: "交通费",
      invoices: [],
    };
    const tx = {
      reimbursement: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({ ...current, status: 4 }),
      },
      attachmentRelation: { count: vi.fn().mockResolvedValue(1) },
      account: { findMany: vi.fn().mockResolvedValue([{ id: 5, code: "6602" }, { id: 7, code: "1002" }]) },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 1 }]),
      voucherSequence: { update: vi.fn() },
      voucher: { create: voucherCreate },
      accountingEvent: { create: vi.fn().mockResolvedValue({ id: 18 }) },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: (callback: (client: any) => unknown) => callback(tx) } as any;
    const periodResolver = { resolveOpenPeriod: vi.fn().mockResolvedValue({ id: 9, year: 2026, month: 7 }) } as any;
    const service = new ReimbursementService(prisma, periodResolver);

    await service.pay(14, {
      paymentDate: "2026-07-29",
      expenseAccountId: 5,
      paymentAccountId: 7,
    }, { actorId: 10, role: "ADMIN" });

    const entries = voucherCreate.mock.calls[0]![0].data.entries.create;
    expect(entries.map((row: any) => [row.accountId, row.debitAmount.toString(), row.creditAmount.toString()]))
      .toEqual([[5, "30", "0"], [7, "0", "30"]]);
    expect(voucherCreate.mock.calls[0]![0].data.summary).toContain("无票支出");
  });
});
