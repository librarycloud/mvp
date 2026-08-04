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
});
