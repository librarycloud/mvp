import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { calculateBalance } from "../ledger/ledger-balance.js";
import type { AccountBalanceRepository } from "./account-balance.repository.js";
import type { AccountBalanceQuery, BalanceAccount, DebitCreditTotal } from "./account-balance.types.js";

interface MutableBalance {
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
}

export class AccountBalanceService {
  constructor(private readonly repository: AccountBalanceRepository) {}

  async getBalances(query: AccountBalanceQuery) {
    if (query.startDate > query.endDate) {
      throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    }
    const [accounts, opening, period] = await Promise.all([
      this.repository.listAccounts(),
      this.repository.aggregateBefore(query.startDate),
      this.repository.aggregatePeriod(query),
    ]);
    const balances = new Map<number, MutableBalance>(
      accounts.map((account) => [account.id, this.emptyBalance()]),
    );
    this.apply(balances, opening, "opening");
    this.apply(balances, period, "period");
    this.rollupParents(accounts, balances);

    const rows = accounts
      .map((account) => this.toRow(account, balances.get(account.id)!))
      .filter((row) => query.includeZero || !this.isZero(row));
    return { startDate: query.startDate, endDate: query.endDate, rows };
  }

  private emptyBalance(): MutableBalance {
    return {
      openingDebit: new Prisma.Decimal(0), openingCredit: new Prisma.Decimal(0),
      periodDebit: new Prisma.Decimal(0), periodCredit: new Prisma.Decimal(0),
    };
  }

  private apply(
    balances: Map<number, MutableBalance>,
    totals: DebitCreditTotal[],
    period: "opening" | "period",
  ): void {
    for (const total of totals) {
      const balance = balances.get(total.accountId);
      if (!balance) continue;
      if (period === "opening") {
        balance.openingDebit = balance.openingDebit.plus(total.debit);
        balance.openingCredit = balance.openingCredit.plus(total.credit);
      } else {
        balance.periodDebit = balance.periodDebit.plus(total.debit);
        balance.periodCredit = balance.periodCredit.plus(total.credit);
      }
    }
  }

  private rollupParents(accounts: BalanceAccount[], balances: Map<number, MutableBalance>): void {
    const sorted = [...accounts].sort((left, right) => right.level - left.level);
    for (const account of sorted) {
      if (!account.parentId) continue;
      const own = balances.get(account.id)!;
      const parent = balances.get(account.parentId);
      if (!parent) continue;
      parent.openingDebit = parent.openingDebit.plus(own.openingDebit);
      parent.openingCredit = parent.openingCredit.plus(own.openingCredit);
      parent.periodDebit = parent.periodDebit.plus(own.periodDebit);
      parent.periodCredit = parent.periodCredit.plus(own.periodCredit);
    }
  }

  private toRow(account: BalanceAccount, balance: MutableBalance) {
    const opening = calculateBalance(balance.openingDebit.minus(balance.openingCredit));
    const closing = calculateBalance(
      balance.openingDebit.plus(balance.periodDebit).minus(balance.openingCredit).minus(balance.periodCredit),
    );
    return {
      account: {
        id: account.id, code: account.code, name: account.name, category: account.category,
        normalDirection: account.normalDirection, parentId: account.parentId, level: account.level,
        isEnabled: account.isEnabled, deletedAt: account.deletedAt,
      },
      opening,
      periodDebit: balance.periodDebit.toString(),
      periodCredit: balance.periodCredit.toString(),
      closing,
    };
  }

  private isZero(row: ReturnType<AccountBalanceService["toRow"]>): boolean {
    return (
      row.opening.amount === "0" && row.periodDebit === "0" && row.periodCredit === "0" && row.closing.amount === "0"
    );
  }
}
