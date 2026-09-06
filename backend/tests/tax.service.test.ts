import { describe, expect, it, vi } from "vitest";
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
      taxDeclaration: { findFirst: baseFind },
      $transaction: vi.fn(async (work) => work(tx)),
    } as any;

    await expect(new TaxService(prisma).prepare("VAT", { periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1)).resolves.toBe(saved);
    expect(tx.taxDeclaration.findFirst).toHaveBeenCalledTimes(2);
    expect(baseFind).not.toHaveBeenCalled();
  });

  it("inspects VAT tax burden risk and zero-declaration risk", async () => {
    const declaration = {
      id: 9,
      taxType: "VAT",
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-07-31"),
      payableAmount: new Prisma.Decimal("0"),
      lines: [
        { lineCode: "OUTPUT_TAX", declared: new Prisma.Decimal("1000") },
        { lineCode: "DEDUCTIBLE_INPUT_TAX", declared: new Prisma.Decimal("-1000") },
      ],
    };
    const prisma = {
      taxDeclaration: { findFirst: vi.fn().mockResolvedValue(declaration) },
      invoice: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmountWithoutTax: new Prisma.Decimal("10000") } }),
      },
    } as any;
    const result = await new TaxService(prisma).inspectRisks(9);
    expect(result.riskCount).toBeGreaterThan(0);
    expect(result.risks.some((r) => r.ruleCode === "VAT_ZERO_DECLARATION")).toBe(true);
    expect(result.risks.some((r) => r.ruleCode === "VAT_BURDEN_LOW")).toBe(true);
  });

  it("auto-generates standard tax declaration receipt number if not provided", async () => {
    const row = { id: 10, fiscalYear: 2026, period: 8, status: "REVIEWED" };
    const saved = { ...row, status: "DECLARED", declarationNo: "DZSWJ-202608-000010" };
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

    const result = await new TaxService(prisma).declare(10, undefined, 1);
    expect(tx.taxDeclaration.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ declarationNo: "DZSWJ-202608-000010", status: "DECLARED" }),
    });
    expect(result).toEqual(saved);
  });
});
