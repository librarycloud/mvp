import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { calculateMonthlyDepreciation } from "../src/modules/depreciation/depreciation-calculator.js";

describe("calculateMonthlyDepreciation", () => {
  it("calculates STRAIGHT_LINE depreciation accurately", () => {
    const asset = {
      originalValue: new Prisma.Decimal("120000"),
      residualValue: new Prisma.Decimal("6000"), // 5% residual
      accumulatedDepreciation: new Prisma.Decimal("0"),
      usefulLifeMonths: 60,
      depreciationMethod: "STRAIGHT_LINE",
      startUseDate: new Date("2026-01-15"),
    };
    // (120000 - 6000) / 60 = 1900.00
    const period = { startDate: new Date("2026-02-01") };
    const amount = calculateMonthlyDepreciation(asset, period);
    expect(amount.toString()).toBe("1900");
  });

  it("calculates DOUBLE_DECLINING depreciation with transition in last 24 months", () => {
    // 36 months = 3 years, cost 100,000, residual 5,000
    // Monthly rate = 2 / 36 = 1/18
    const asset = {
      originalValue: new Prisma.Decimal("100000"),
      residualValue: new Prisma.Decimal("5000"),
      accumulatedDepreciation: new Prisma.Decimal("0"),
      usefulLifeMonths: 36,
      depreciationMethod: "DOUBLE_DECLINING",
      startUseDate: new Date("2026-01-15"),
    };
    // First month: 100000 * (2 / 36) = 5555.56
    const p1 = { startDate: new Date("2026-02-01") };
    const a1 = calculateMonthlyDepreciation(asset, p1);
    expect(a1.toString()).toBe("5555.56");

    // In the last 24 months, it switches to straight line over remaining net book value
    const lateAsset = {
      ...asset,
      accumulatedDepreciation: new Prisma.Decimal("50000"),
    };
    // 25 months elapsed => remaining 11 months (< 24)
    // Period date = 2028-03-01 (elapsed = (2028-2026)*12 + (3-1) - 1 = 25 months)
    // Remaining months = 36 - 25 = 11
    // (100000 - 50000 - 5000) / 11 = 45000 / 11 = 4090.91
    const latePeriod = { startDate: new Date("2028-03-01") };
    const lateAmount = calculateMonthlyDepreciation(lateAsset, latePeriod);
    expect(lateAmount.toString()).toBe("4090.91");
  });

  it("calculates SUM_OF_YEARS depreciation across lifecycles", () => {
    // Useful life = 36 months (3 years)
    // Depreciable base = 100,000 - 4,000 = 96,000
    // Sum of years = 1 + 2 + 3 = 6
    // Year 1 annual rate: 3/6 = 50%. Monthly: 96,000 * (3/6) / 12 = 4,000.00
    const asset = {
      originalValue: new Prisma.Decimal("100000"),
      residualValue: new Prisma.Decimal("4000"),
      accumulatedDepreciation: new Prisma.Decimal("0"),
      usefulLifeMonths: 36,
      depreciationMethod: "SUM_OF_YEARS",
      startUseDate: new Date("2026-06-15"),
    };
    // Month 1 (July 2026): Year 1 of asset life
    const p1 = { startDate: new Date("2026-07-01") };
    const a1 = calculateMonthlyDepreciation(asset, p1);
    expect(a1.toString()).toBe("4000");

    // Year 2 of asset life (August 2027 => 13 months elapsed):
    // Annual rate: 2/6 = 33.333%. Monthly: 96,000 * (2/6) / 12 = 2,666.67
    const p2 = { startDate: new Date("2027-08-01") };
    const a2 = calculateMonthlyDepreciation(asset, p2);
    expect(a2.toString()).toBe("2666.67");
  });
});
