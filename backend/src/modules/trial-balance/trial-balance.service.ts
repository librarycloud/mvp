import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { calculateBalance } from "../ledger/ledger-balance.js";
import type { TrialBalanceRepository } from "./trial-balance.repository.js";
import type { TrialBalanceQuery, TrialDebitCreditTotal } from "./trial-balance.types.js";

interface DirectTotal {
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
}

export class TrialBalanceService {
  constructor(private readonly repository: TrialBalanceRepository) {}

  async getTrialBalance(query: TrialBalanceQuery) {
    if (query.startDate > query.endDate) throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    const [accounts, opening, period] = await Promise.all([
      this.repository.listAccounts(), this.repository.aggregateBefore(query.startDate), this.repository.aggregatePeriod(query),
    ]);
    const totals = new Map(accounts.map((account) => [account.id, this.empty()]));
    this.apply(totals, opening, "opening");
    this.apply(totals, period, "period");

    const rows = accounts
      .map((account) => this.toRow(account, totals.get(account.id)!))
      .filter((row) => accountShouldDisplay(row, query.includeZero));
    const summary = rows.reduce(
      (sum, row) => ({
        openingDebit: sum.openingDebit.plus(row.openingDebit), openingCredit: sum.openingCredit.plus(row.openingCredit),
        periodDebit: sum.periodDebit.plus(row.periodDebit), periodCredit: sum.periodCredit.plus(row.periodCredit),
        closingDebit: sum.closingDebit.plus(row.closingDebit), closingCredit: sum.closingCredit.plus(row.closingCredit),
      }),
      this.summaryEmpty(),
    );
    return {
      startDate: query.startDate,
      endDate: query.endDate,
      rows,
      totals: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, value.toString()])),
      isBalanced:
        summary.openingDebit.equals(summary.openingCredit) &&
        summary.periodDebit.equals(summary.periodCredit) &&
        summary.closingDebit.equals(summary.closingCredit),
    };
  }

  private empty(): DirectTotal {
    return { openingDebit: new Prisma.Decimal(0), openingCredit: new Prisma.Decimal(0), periodDebit: new Prisma.Decimal(0), periodCredit: new Prisma.Decimal(0) };
  }

  private summaryEmpty() {
    return {
      openingDebit: new Prisma.Decimal(0), openingCredit: new Prisma.Decimal(0),
      periodDebit: new Prisma.Decimal(0), periodCredit: new Prisma.Decimal(0),
      closingDebit: new Prisma.Decimal(0), closingCredit: new Prisma.Decimal(0),
    };
  }

  private apply(totals: Map<number, DirectTotal>, rows: TrialDebitCreditTotal[], period: "opening" | "period") {
    for (const row of rows) {
      const total = totals.get(row.accountId);
      if (!total) continue;
      if (period === "opening") {
        total.openingDebit = total.openingDebit.plus(row.debit);
        total.openingCredit = total.openingCredit.plus(row.credit);
      } else {
        total.periodDebit = total.periodDebit.plus(row.debit);
        total.periodCredit = total.periodCredit.plus(row.credit);
      }
    }
  }

  private toRow(account: Awaited<ReturnType<TrialBalanceRepository["listAccounts"]>>[number], total: DirectTotal) {
    const opening = calculateBalance(total.openingDebit.minus(total.openingCredit));
    const closing = calculateBalance(
      total.openingDebit.plus(total.periodDebit).minus(total.openingCredit).minus(total.periodCredit),
    );
    return {
      account,
      hasDirectActivity: !total.openingDebit.isZero() || !total.openingCredit.isZero() || !total.periodDebit.isZero() || !total.periodCredit.isZero(),
      openingDirection: opening.direction,
      openingDebit: opening.direction === "DEBIT" ? opening.amount : "0",
      openingCredit: opening.direction === "CREDIT" ? opening.amount : "0",
      periodDebit: total.periodDebit.toString(),
      periodCredit: total.periodCredit.toString(),
      closingDirection: closing.direction,
      closingDebit: closing.direction === "DEBIT" ? closing.amount : "0",
      closingCredit: closing.direction === "CREDIT" ? closing.amount : "0",
    };
  }
}

function accountShouldDisplay(
  row: ReturnType<TrialBalanceService["toRow"]>,
  includeZero: boolean,
): boolean {
  if (!row.account.isLeaf && !row.hasDirectActivity) return false;
  if (includeZero) return true;
  return row.hasDirectActivity;
}
