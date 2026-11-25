import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "../src/generated/prisma/client.js";
import { TaxService } from "../src/modules/tax/tax.service.js";

describe("TaxService", () => {
  it("calculates the tax foundation with Decimal amounts", async () => {
    const prisma = {
      invoice: {
        aggregate: vi.fn()
          .mockResolvedValueOnce({ _sum: { totalAmountWithoutTax: new Prisma.Decimal("1000"), totalTaxAmount: new Prisma.Decimal("60"), totalTaxIncludedAmount: new Prisma.Decimal("1060"), deductibleTaxAmount: null } })
          .mockResolvedValueOnce({ _sum: { totalAmountWithoutTax: new Prisma.Decimal("500"), totalTaxAmount: new Prisma.Decimal("30"), totalTaxIncludedAmount: new Prisma.Decimal("530"), deductibleTaxAmount: new Prisma.Decimal("24") } }),
      },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ vatTaxpayerType: "GENERAL" }) },
    } as any;
    const result = await new TaxService(prisma).foundation({ periodType: "MONTH", fiscalYear: 2026, period: 7 });
    expect(result.output.tax).toBe("60");
    expect(result.input.deductibleTax).toBe("24");
    expect(result.taxPayableBeforeOtherAdjustments).toBe("36");
    expect(prisma.invoice.aggregate).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid quarter", async () => {
    const service = new TaxService({} as any);
    await expect(service.foundation({ periodType: "QUARTER", fiscalYear: 2026, period: 5 })).rejects.toMatchObject({ code: "INVALID_TAX_PERIOD" });
  });

  it("reads a newly prepared declaration through the same transaction client", async () => {
    const saved = { id: 8, status: "DRAFT", lines: [], payments: [] };
    const baseFind = vi.fn();
    const tx = {
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(saved),
        create: vi.fn().mockResolvedValue({ id: 8 }),
      },
      taxDeclarationLine: { deleteMany: vi.fn(), createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: {} }) },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ vatTaxpayerType: "SMALL_SCALE", vatFilingPeriod: "MONTH", citFilingPeriod: "QUARTER", citTaxCollectionMethod: "ACCOUNTING", smallProfitEnterpriseEligible: "YES", surchargeReductionEligible: "NO", urbanMaintenanceRate: new Prisma.Decimal("0.07"), educationSurchargeRate: new Prisma.Decimal("0.03"), localEducationSurchargeRate: new Prisma.Decimal("0.02"), surchargeReductionRate: new Prisma.Decimal("0") }) },
      taxDeclaration: { findFirst: baseFind },
      $transaction: vi.fn(async (work) => work(tx)),
    } as any;

    await expect(new TaxService(prisma).prepare("VAT", { periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1)).resolves.toBe(saved);
    expect(tx.taxDeclaration.findFirst).toHaveBeenCalledTimes(2);
    expect(baseFind).not.toHaveBeenCalled();
  });

  it("recalculates VAT payable after a source line adjustment", async () => {
    const lines = [
      { id: 1, lineCode: "OUTPUT_TAX", lineName: "销项税额", calculated: new Prisma.Decimal("100"), adjustment: new Prisma.Decimal("0"), declared: new Prisma.Decimal("100") },
      { id: 2, lineCode: "DEDUCTIBLE_INPUT_TAX", lineName: "可抵扣进项税额", calculated: new Prisma.Decimal("-20"), adjustment: new Prisma.Decimal("0"), declared: new Prisma.Decimal("-20") },
      { id: 3, lineCode: "PAYABLE", lineName: "应缴增值税", calculated: new Prisma.Decimal("80"), adjustment: new Prisma.Decimal("0"), declared: new Prisma.Decimal("80") },
    ];
    const declaration = { id: 5, taxType: "VAT", status: "DRAFT", lines };
    const tx = {
      $queryRaw: vi.fn(),
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValueOnce(declaration).mockResolvedValueOnce(declaration),
        update: vi.fn(),
      },
      taxDeclarationLine: {
        update: vi.fn(async ({ where, data }) => Object.assign(lines.find(line => line.id === where.id)!, data)),
        findMany: vi.fn().mockResolvedValue(lines),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async work => work(tx)) } as any;

    const result = await new TaxService(prisma).updateLines(5, [{ lineCode: "OUTPUT_TAX", adjustmentAmount: "10" }], 1);

    expect(lines.find(line => line.lineCode === "PAYABLE")?.declared.toString()).toBe("90");
    expect(tx.taxDeclaration.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { payableAmount: new Prisma.Decimal("90"), declaredAmount: new Prisma.Decimal("90") } });
    expect(result).toBe(declaration);
  });

  it("refuses to prepare tax estimates until the relevant profile settings are confirmed", async () => {
    const prisma = {
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ vatTaxpayerType: "UNKNOWN", vatFilingPeriod: "UNKNOWN" }) },
      invoice: { aggregate: vi.fn() },
    } as any;

    await expect(new TaxService(prisma).prepare("VAT", { periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1)).rejects.toMatchObject({ code: "TAX_PROFILE_INCOMPLETE" });
    expect(prisma.invoice.aggregate).not.toHaveBeenCalled();
  });

  it("exports a clearly labeled internal workbook with percentage rows formatted as rates", async () => {
    const prisma = {
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 4,
          taxType: "CORPORATE_INCOME",
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-12-31T00:00:00.000Z"),
          lines: [{ lineCode: "TAX_RATE", lineName: "适用税率估算", calculated: new Prisma.Decimal("0.05"), adjustment: new Prisma.Decimal(0), declared: new Prisma.Decimal("0.05"), remark: null }],
          payments: [],
        }),
      },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ name: "示例公司", unifiedSocialCreditCode: "91310000XXXXXXXXXX" }) },
    } as any;
    const buffer = await new TaxService(prisma).exportDraft(4);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("内部填报底稿")!;

    expect(String(sheet.getCell("B5").value)).toContain("非税务机关官方申报表");
    expect(sheet.getCell("C8").numFmt).toBe("0.00%");
    expect(sheet.getCell("C8").value).toBe(0.05);
  });

  it("does not emit a hard-coded industry tax burden warning", async () => {
    const declaration = {
      id: 9,
      taxType: "VAT",
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      declaredAmount: new Prisma.Decimal("0"),
      lines: [
        { lineCode: "OUTPUT_TAX", declared: new Prisma.Decimal("1000") },
        { lineCode: "DEDUCTIBLE_INPUT_TAX", declared: new Prisma.Decimal("-1000") },
      ],
    };
    const prisma = {
      taxDeclaration: { findFirst: vi.fn().mockResolvedValue(declaration) },
    } as any;
    const result = await new TaxService(prisma).inspectRisks(9);
    expect(result.risks.some((r) => r.ruleCode === "VAT_BURDEN_LOW")).toBe(false);
    expect(result.risks.some((r) => r.ruleCode === "VAT_ZERO_PAYABLE")).toBe(true);
  });

  it("requires the actual tax filing receipt number", async () => {
    const row = { id: 10, fiscalYear: 2026, period: 8, status: "REVIEWED" };
    const saved = { ...row, status: "DECLARED", declarationNo: "REAL-RECEIPT-001" };
    const tx = {
      $queryRaw: vi.fn(),
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(saved),
        update: vi.fn().mockResolvedValue(saved),
      },
      auditLog: { create: vi.fn() },
      companyProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn(async (work) => work(tx)),
      taxDeclaration: { findFirst: vi.fn().mockResolvedValue(saved) },
    } as any;

    const result = await new TaxService(prisma).declare(10, "REAL-RECEIPT-001", 1);
    expect(tx.taxDeclaration.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ declarationNo: "REAL-RECEIPT-001", status: "DECLARED" }),
    });
    expect(result).toEqual(saved);
  });

  it("accrues surcharges based on VAT payable using exact surcharge accounts and skips zero-rounded entries", async () => {
    const accountsByCode: Record<string, { id: number; code: string; name: string }> = {
      "6403": { id: 6403, code: "6403", name: "税金及附加" },
      "222112": { id: 222112, code: "222112", name: "应交城市维护建设税" },
      "222113": { id: 222113, code: "222113", name: "应交教育费附加" },
      "222114": { id: 222114, code: "222114", name: "应交地方教育附加" },
    };
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 1 }]),
      accountingPeriod: {
        findFirst: vi.fn().mockResolvedValue({ id: 5, year: 2026, month: 7, periodCode: "2026-07", endDate: new Date("2026-07-31"), status: 0 }),
      },
      accountingEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ vatFilingPeriod: "MONTH", surchargeReductionEligible: "NO", urbanMaintenanceRate: new Prisma.Decimal("0.07"), educationSurchargeRate: new Prisma.Decimal("0.03"), localEducationSurchargeRate: new Prisma.Decimal("0.02"), surchargeReductionRate: new Prisma.Decimal("0") }) },
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, status: "DECLARED", declaredAmount: new Prisma.Decimal("10000") }),
      },
      account: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          const code = typeof where.code === "string" ? where.code : where.code?.startsWith;
          return Promise.resolve(accountsByCode[code] ?? null);
        }),
      },
      $executeRaw: vi.fn(),
      voucherSequence: { update: vi.fn() },
      voucher: {
        create: vi.fn().mockImplementation((args) => ({ id: 99, ...args.data })),
      },
    };

    const prisma = {
      $transaction: vi.fn(async (fn) => fn(mockTx)),
    } as any;

    const service = new TaxService(prisma);
    const voucher = await service.accrueSurcharges(5, { actorId: 1, role: "ADMIN" });
    expect(voucher.id).toBe(99);
    // 10000 * (7% + 3% + 2%) = 1200
    expect(voucher.totalDebit.toString()).toBe("1200");
    expect(voucher.totalCredit.toString()).toBe("1200");
    expect(voucher.entries.create).toHaveLength(4);
    expect(voucher.entries.create[1].accountId).toBe(222112);
    expect(voucher.entries.create[2].accountId).toBe(222113);
    expect(voucher.entries.create[3].accountId).toBe(222114);
  });

  it("skips zero-rounded surcharge credit entries and maps CIT payment to 222115", async () => {
    const accountsByCode: Record<string, { id: number; code: string; name: string }> = {
      "1002": { id: 1002, code: "1002", name: "银行存款" },
      "6403": { id: 6403, code: "6403", name: "税金及附加" },
      "222112": { id: 222112, code: "222112", name: "应交城市维护建设税" },
      "222113": { id: 222113, code: "222113", name: "应交教育费附加" },
      "222114": { id: 222114, code: "222114", name: "应交地方教育附加" },
      "222115": { id: 222115, code: "222115", name: "应交企业所得税" },
    };
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 2 }]),
      accountingPeriod: {
        findFirst: vi.fn().mockResolvedValue({ id: 5, year: 2026, month: 7, periodCode: "2026-07", endDate: new Date("2026-07-31"), status: 0 }),
      },
      accountingEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ vatFilingPeriod: "MONTH", surchargeReductionEligible: "YES", urbanMaintenanceRate: new Prisma.Decimal("0.07"), educationSurchargeRate: new Prisma.Decimal("0.03"), localEducationSurchargeRate: new Prisma.Decimal("0.02"), surchargeReductionRate: new Prisma.Decimal("0.5") }) },
      taxDeclaration: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, taxType: "CORPORATE_INCOME", status: "DECLARED", declaredAmount: new Prisma.Decimal("0.30"), declarationNo: "CIT-001", payments: [] }),
        update: vi.fn(),
      },
      taxPayment: { create: vi.fn().mockResolvedValue({ id: 7 }) },
      auditLog: { create: vi.fn() },
      account: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          const code = typeof where.code === "string" ? where.code : where.code?.startsWith;
          return Promise.resolve(accountsByCode[code] ?? null);
        }),
      },
      $executeRaw: vi.fn(),
      voucherSequence: { update: vi.fn() },
      voucher: {
        create: vi.fn().mockImplementation((args) => ({ id: 100, ...args.data })),
      },
    };
    const prisma = { $transaction: vi.fn(async (fn) => fn(mockTx)) } as any;
    const periods = { resolveOpenPeriod: vi.fn().mockResolvedValue({ id: 5, year: 2026, month: 7, periodCode: "2026-07" }) } as any;

    const service = new TaxService(prisma, periods);
    const accrualVoucher = await service.accrueSurcharges(5, { actorId: 1, role: "ADMIN" });
    // 0.30 * 7% * 0.5 = 0.01; 0.30 * 3% * 0.5 = 0.00; 0.30 * 2% * 0.5 = 0.00 -> only 1 debit + 1 credit line
    expect(accrualVoucher.totalDebit.toString()).toBe("0.01");
    expect(accrualVoucher.entries.create).toHaveLength(2);

    await service.pay(1, { amount: "0.30", paymentDate: "2026-07-15" }, 1);
    const payVoucherCall = mockTx.voucher.create.mock.calls[1]?.[0]?.data;
    expect(payVoucherCall.entries.create[0].accountId).toBe(222115);
  });

  it("does not record a tax payment when its accounting period is closed", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      taxDeclaration: { findFirst: vi.fn().mockResolvedValue({ id: 2, status: "DECLARED", declaredAmount: new Prisma.Decimal("100"), payments: [] }) },
      taxPayment: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) } as any;
    const periods = { resolveOpenPeriod: vi.fn().mockRejectedValue(new Error("period closed")) } as any;
    await expect(new TaxService(prisma, periods).pay(2, { amount: "100", paymentDate: "2026-07-01" }, 1)).rejects.toThrow("period closed");
    expect(tx.taxPayment.create).not.toHaveBeenCalled();
  });

  it("refuses to accrue surcharges into a closed accounting period", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      accountingPeriod: { findFirst: vi.fn().mockResolvedValue({ id: 5, status: 1 }) },
      taxDeclaration: { findFirst: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async work => work(tx)) } as any;

    await expect(new TaxService(prisma).accrueSurcharges(5, { actorId: 1, role: "ADMIN" })).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
    expect(tx.taxDeclaration.findFirst).not.toHaveBeenCalled();
  });
});
