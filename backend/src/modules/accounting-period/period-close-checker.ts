import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { FIXED_ASSET_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodRecord } from "./accounting-period.types.js";

export type CloseCheckLevel = "PASS" | "WARN" | "BLOCK";
export interface CloseCheckItem { code: string; name: string; level: CloseCheckLevel; count: number; message: string; route?: string; }
export interface AccountingPeriodCloseChecker {
  inspect(period: AccountingPeriodRecord): Promise<{ ready: boolean; checks: CloseCheckItem[] }>;
  assertReady(period: AccountingPeriodRecord): Promise<void>;
}

const ZERO = new Prisma.Decimal(0);
export class PrismaPeriodCloseChecker implements AccountingPeriodCloseChecker {
  constructor(private readonly prisma: PrismaClient) {}

  async inspect(period: AccountingPeriodRecord) {
    const [pendingVouchers, totals, unmatchedBank, reconciliations, assets, employees, salaries, reimbursements, reports] = await Promise.all([
      this.prisma.voucher.count({ where: { periodId: period.id, deletedAt: null, status: { in: [0, 1] } } }),
      this.prisma.voucherEntry.aggregate({ where: { deletedAt: null, voucher: { periodId: period.id, status: VOUCHER_STATUS.POSTED, deletedAt: null } }, _sum: { debitAmount: true, creditAmount: true } }),
      this.prisma.bankTransaction.count({ where: { deletedAt: null, transactionDate: { gte: period.startDate, lte: period.endDate }, voucherId: null, reconciliationMatches: { none: { deletedAt: null } } } }),
      this.prisma.bankReconciliation.findMany({ where: { periodId: period.id, deletedAt: null }, select: { status: true } }),
      this.prisma.fixedAsset.findMany({
        where: { deletedAt: null, status: FIXED_ASSET_STATUS.ACTIVE, startUseDate: { lt: period.startDate } },
        select: {
          originalValue: true,
          residualValue: true,
          accumulatedDepreciation: true,
          depreciationRecords: { where: { periodId: period.id, deletedAt: null }, select: { status: true } },
        },
      }),
      this.prisma.employee.count({ where: { deletedAt: null, status: 0 } }),
      this.prisma.salary.count({ where: { periodId: period.id, deletedAt: null, status: VOUCHER_STATUS.POSTED } }),
      this.prisma.reimbursement.count({ where: { deletedAt: null, status: 2, expenseDate: { lte: period.endDate } } }),
      this.prisma.report.findMany({ where: { deletedAt: null, fiscalYear: period.year, periodType: "MONTH", periodStart: { gte: period.startDate }, periodEnd: { lte: period.endDate } }, select: { template: { select: { type: true } } } }),
    ]);
    const debit = totals._sum.debitAmount ?? ZERO; const credit = totals._sum.creditAmount ?? ZERO;
    const reportTypes = new Set(reports.map(row => row.template.type));
    const incompleteReconciliations = reconciliations.filter(row => row.status !== 1).length;
    const depreciableAssets = assets.filter(asset => asset.accumulatedDepreciation.lessThan(asset.originalValue.minus(asset.residualValue)));
    const postedDepreciation = depreciableAssets.filter(asset => asset.depreciationRecords.some(record => record.status === VOUCHER_STATUS.POSTED)).length;
    const missingDepreciation = depreciableAssets.length - postedDepreciation;
    const checks: CloseCheckItem[] = [
      this.item("VOUCHERS", "凭证审核记账", pendingVouchers ? "BLOCK" : "PASS", pendingVouchers, pendingVouchers ? `有 ${pendingVouchers} 张草稿或待审核凭证` : "本期凭证均已处理", "/vouchers"),
      this.item("TRIAL_BALANCE", "试算平衡", debit.equals(credit) ? "PASS" : "BLOCK", debit.equals(credit) ? 0 : 1, debit.equals(credit) ? "借贷发生额平衡" : `借方 ${debit.toString()}，贷方 ${credit.toString()}`, "/ledgers"),
      this.item("BANK", "银行对账", unmatchedBank || incompleteReconciliations ? "BLOCK" : "PASS", unmatchedBank + incompleteReconciliations, unmatchedBank || incompleteReconciliations ? `未匹配流水 ${unmatchedBank} 条，未完成对账单 ${incompleteReconciliations} 张` : "银行流水和对账单已处理", "/bank-reconciliations"),
      this.item("DEPRECIATION", "固定资产折旧", missingDepreciation ? "BLOCK" : "PASS", missingDepreciation, missingDepreciation ? `仍有 ${missingDepreciation} 项应计提资产未计提折旧` : "本期折旧已完成", "/depreciation"),
      this.item("SALARY", "工资计提", salaries < employees ? "BLOCK" : "PASS", Math.max(0, employees - salaries), salaries < employees ? `仍有 ${employees - salaries} 名在职员工未生成工资` : "本期工资已完成", "/salaries"),
      this.item("REIMBURSEMENT", "待付款报销", reimbursements ? "WARN" : "PASS", reimbursements, reimbursements ? `有 ${reimbursements} 张已审批报销单尚未付款` : "没有待付款报销", "/reimbursements"),
      this.item("REPORTS", "月度财务报表", reportTypes.size >= 3 ? "PASS" : "BLOCK", Math.max(0, 3 - reportTypes.size), reportTypes.size >= 3 ? "资产负债表、利润表、现金流量表已生成" : `三张主表尚缺 ${3 - reportTypes.size} 张`, "/reports"),
    ];
    return { ready: checks.every(item => item.level !== "BLOCK"), checks };
  }

  async assertReady(period: AccountingPeriodRecord) {
    const result = await this.inspect(period);
    if (!result.ready) throw new AppError("PERIOD_CLOSE_CHECK_FAILED", "月结检查存在阻断项，不能关账", 409, result);
  }

  private item(code: string, name: string, level: CloseCheckLevel, count: number, message: string, route: string): CloseCheckItem { return { code, name, level, count, message, route }; }
}
