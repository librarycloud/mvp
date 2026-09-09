import { Prisma } from "../../generated/prisma/client.js";

const ZERO = new Prisma.Decimal(0);

export interface DepreciableAsset {
  originalValue: Prisma.Decimal;
  residualValue: Prisma.Decimal;
  accumulatedDepreciation: Prisma.Decimal;
  usefulLifeMonths: number;
  depreciationMethod: string;
  startUseDate: Date;
}

export interface DepreciationPeriod {
  startDate: Date;
  endDate?: Date;
  year?: number;
  month?: number;
}

/**
 * Calculates monthly depreciation amount conforming to Chinese Accounting Standards (CAS 4).
 * Supports:
 * - STRAIGHT_LINE (年限平均法)
 * - DOUBLE_DECLINING (双倍余额递减法，倒数24个月平滑转为年限平均法)
 * - SUM_OF_YEARS (年数总和法，按资产实际使用年限逐年递减)
 */
export function calculateMonthlyDepreciation(
  asset: DepreciableAsset,
  period: DepreciationPeriod,
): Prisma.Decimal {
  const original = asset.originalValue;
  const residual = asset.residualValue;
  const depreciable = original.minus(residual);
  const accumulated = asset.accumulatedDepreciation;
  const totalMonths = asset.usefulLifeMonths;

  if (totalMonths <= 0) return ZERO;
  const remainingDepreciable = depreciable.minus(accumulated);
  if (remainingDepreciable.lessThan(new Prisma.Decimal("0.01"))) return ZERO;

  const currentNBV = original.minus(accumulated);
  if (currentNBV.minus(residual).lessThanOrEqualTo(0)) return ZERO;

  const method = asset.depreciationMethod || "STRAIGHT_LINE";

  if (method === "STRAIGHT_LINE" || !asset.startUseDate || !period?.startDate) {
    const rawMonthly = original.minus(residual).div(totalMonths).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return Prisma.Decimal.min(rawMonthly, remainingDepreciable);
  }

  // Calculate elapsed full months since startUseDate (accounting convention: next month begins depreciation)
  const yDiff = period.startDate.getFullYear() - asset.startUseDate.getFullYear();
  const mDiff = period.startDate.getMonth() - asset.startUseDate.getMonth();
  const elapsedMonths = Math.max(0, yDiff * 12 + mDiff - 1);
  const remainingMonths = Math.max(1, totalMonths - elapsedMonths);

  if (method === "DOUBLE_DECLINING") {
    // 双倍余额递减法:
    // CAS 4 规范：到期前两年内（最后24个月），将净值扣除预计净残值后的余额平均摊销
    const isLastTwoYears = remainingMonths <= 24 || totalMonths <= 24;
    if (isLastTwoYears) {
      const netToAmortize = currentNBV.minus(residual);
      if (netToAmortize.lessThanOrEqualTo(0)) return ZERO;
      const monthly = netToAmortize.div(remainingMonths).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return Prisma.Decimal.min(monthly, remainingDepreciable);
    }

    // 前期按双倍直线率计算：月折旧率 = 2 / totalMonths
    const monthlyRate = new Prisma.Decimal(2).div(totalMonths);
    let monthly = currentNBV.mul(monthlyRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    // 确保扣除折旧后净值不低于净残值
    const maxAllowed = currentNBV.minus(residual);
    if (monthly.greaterThan(maxAllowed)) {
      monthly = maxAllowed;
    }
    return Prisma.Decimal.min(monthly, remainingDepreciable);
  }

  if (method === "SUM_OF_YEARS") {
    // 年数总和法:
    // 年折旧率 = (尚可使用年数) / (年数总和)
    const totalYears = Math.max(1, Math.ceil(totalMonths / 12));
    const sumOfYears = (totalYears * (totalYears + 1)) / 2;
    const elapsedYears = Math.min(totalYears - 1, Math.floor(elapsedMonths / 12));
    const remainingYears = totalYears - elapsedYears;

    // 当期年折旧率与月折旧额
    const annualRate = new Prisma.Decimal(remainingYears).div(sumOfYears);
    const monthly = depreciable.mul(annualRate).div(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return Prisma.Decimal.min(monthly, remainingDepreciable);
  }

  // 默认：年限平均法 (STRAIGHT_LINE)
  const monthly = depreciable.div(totalMonths).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const postableRemaining = remainingDepreciable.decimalPlaces() <= 2
    ? remainingDepreciable
    : remainingDepreciable.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return Prisma.Decimal.min(monthly, postableRemaining);
}
