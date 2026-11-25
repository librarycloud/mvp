import{describe,expect,it,vi}from"vitest";import{Prisma}from"../src/generated/prisma/client.js";import{SalaryService}from"../src/modules/salary/salary.service.js";
describe("SalaryService", () => {
  const periods = { assertVoucherOperation: vi.fn() } as any;

  it("only allows administrators to generate salaries", async () => {
    const service = new SalaryService({} as any, periods);
    await expect(service.generate(1, { expenseAccountId: 2, payableAccountId: 3 }, { actorId: 4, role: "ACCOUNTANT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aggregates configured salary items with Decimal", () => {
    const service = new SalaryService({} as any, periods);
    const result = (service as any).itemBuckets([
      { category: "BONUS", defaultAmount: new Prisma.Decimal("100.10") },
      { category: "ALLOWANCE", defaultAmount: new Prisma.Decimal("50.20") },
      { category: "DEDUCTION", defaultAmount: new Prisma.Decimal("20.30") },
    ]);
    expect(result.bonus.toString()).toBe("100.1");
    expect(result.allowance.toString()).toBe("50.2");
    expect(result.deduction.toString()).toBe("20.3");
  });

  it("rejects negative or over-precision salary amounts", async () => {
    const service = new SalaryService({} as any, periods);
    await expect(service.createEmployee({ employeeNo: "E1", name: "甲", baseSalary: "-1" }, { actorId: 4, role: "ADMIN" })).rejects.toMatchObject({ code: "INVALID_SALARY_AMOUNT" });
  });

  it("calculates progressive cumulative individual income tax correctly for month 1 and month 2", async () => {
    const service = new SalaryService({} as any, periods);
    const mockTxMonth1 = {
      salary: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    // Month 1: gross 10,000, social+housing fund 1,000, standard deduction 5,000 -> taxable: 4,000 * 3% = 120
    const taxMonth1 = await (service as any).calculateTax(
      mockTxMonth1 as any,
      { id: 101 },
      { year: 2026, month: 1 },
      new Prisma.Decimal("10000"),
      new Prisma.Decimal("1000")
    );
    expect(taxMonth1.toString()).toBe("120");

    // Month 2: with prior month 1 posted
    const mockTxMonth2 = {
      salary: {
        findMany: vi.fn().mockResolvedValue([
          {
            grossAmount: new Prisma.Decimal("10000"),
            socialInsurance: new Prisma.Decimal("800"),
            housingFund: new Prisma.Decimal("200"),
            individualIncomeTax: new Prisma.Decimal("120"),
          },
        ]),
      },
    };

    // Month 2: gross 10,000, social 1,000 -> cum gross 20,000, cum social 2,000, cum deduction 10,000 -> cum taxable 8,000 * 3% = 240, minus 120 = 120
    const taxMonth2 = await (service as any).calculateTax(
      mockTxMonth2 as any,
      { id: 101 },
      { year: 2026, month: 2 },
      new Prisma.Decimal("10000"),
      new Prisma.Decimal("1000")
    );
    expect(taxMonth2.toString()).toBe("120");

    // Taxable income <= 0 returns 0
    const zeroTax = await (service as any).calculateTax(
      mockTxMonth1 as any,
      { id: 101 },
      { year: 2026, month: 1 },
      new Prisma.Decimal("5000"),
      new Prisma.Decimal("500")
    );
    expect(zeroTax.toString()).toBe("0");
  });

  it("exports an Excel import template prefilled with active employees", async () => {
    const prisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([
          { employeeNo: "E001", name: "张三", baseSalary: new Prisma.Decimal("10000"), socialInsurance: new Prisma.Decimal("800"), housingFund: new Prisma.Decimal("500") },
        ]),
      },
    } as any;
    const buffer = await new SalaryService(prisma, periods).exportImportTemplate();
    expect(buffer.byteLength).toBeGreaterThan(100);
  });

  it("generates a balanced salary disbursement voucher for net pay and withheld IIT", async () => {
    let createdVoucher: any;
    const mockTx = {
      accountingPeriod: { findUnique: vi.fn().mockResolvedValue({ id: 5, year: 2026, month: 7, periodCode: "2026-07", endDate: new Date("2026-07-31") }) },
      accountingEvent: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      salary: {
        findMany: vi.fn().mockResolvedValue([
          { netAmount: new Prisma.Decimal("8500"), individualIncomeTax: new Prisma.Decimal("200") },
        ]),
      },
      account: { findMany: vi.fn().mockResolvedValue([{ id: 2211 }, { id: 1002 }, { id: 222116 }]) },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 1 }]),
      voucherSequence: { update: vi.fn() },
      voucher: { create: vi.fn().mockImplementation(({ data }) => { createdVoucher = { id: 77, ...data }; return createdVoucher; }) },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (fn) => fn(mockTx)) } as any;
    const payPeriods = { resolveOpenPeriod: vi.fn().mockResolvedValue({ id: 5 }), assertVoucherOperation: vi.fn() } as any;

    const voucher = await new SalaryService(prisma, payPeriods).pay(
      5,
      { payableAccountId: 2211, bankAccountId: 1002, taxPayableAccountId: 222116, paymentDate: "2026-07-31" },
      { actorId: 1, role: "ADMIN" },
    );
    expect(voucher.totalDebit.toString()).toBe("8700");
    expect(createdVoucher.entries.create).toHaveLength(3);
    expect(createdVoucher.entries.create[0]).toMatchObject({ accountId: 2211, debitAmount: new Prisma.Decimal("8700") });
    expect(createdVoucher.entries.create[1]).toMatchObject({ accountId: 1002, creditAmount: new Prisma.Decimal("8500") });
    expect(createdVoucher.entries.create[2]).toMatchObject({ accountId: 222116, creditAmount: new Prisma.Decimal("200") });
  });
});

