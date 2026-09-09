import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { calculateBalance } from "../ledger/ledger-balance.js";
import type { AccountBalanceRepository } from "./account-balance.repository.js";
import type { AccountBalanceQuery, AuxiliaryBalanceQuery, AuxiliaryBalanceRow, BalanceAccount, DebitCreditTotal } from "./account-balance.types.js";

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

  async getAuxiliaryBalances(query: AuxiliaryBalanceQuery) {
    if (query.startDate > query.endDate) {
      throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    }
    const [openingEntries, periodEntries] = await Promise.all([
      this.repository.listAuxiliaryEntries({ lt: query.startDate }, query.accountId, query.dimensionId),
      this.repository.listAuxiliaryEntries({ gte: query.startDate, lte: query.endDate }, query.accountId, query.dimensionId),
    ]);

    interface AuxAgg {
      accountId: number;
      accountCode: string;
      accountName: string;
      dimensionId: number;
      dimensionCode: string;
      dimensionName: string;
      memberId: number;
      memberCode: string;
      memberName: string;
      openingDebit: Prisma.Decimal;
      openingCredit: Prisma.Decimal;
      periodDebit: Prisma.Decimal;
      periodCredit: Prisma.Decimal;
    }

    const map = new Map<string, AuxAgg>();

    const getOrCreate = (entry: (typeof openingEntries)[0]) => {
      const key = `${entry.voucherEntry.accountId}_${entry.dimensionId}_${entry.dimensionMemberId}`;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          accountId: entry.voucherEntry.accountId,
          accountCode: entry.voucherEntry.account.code,
          accountName: entry.voucherEntry.account.name,
          dimensionId: entry.dimensionId,
          dimensionCode: entry.dimension.code,
          dimensionName: entry.dimension.name,
          memberId: entry.dimensionMemberId,
          memberCode: entry.dimensionMember.code,
          memberName: entry.dimensionMember.name,
          openingDebit: new Prisma.Decimal(0),
          openingCredit: new Prisma.Decimal(0),
          periodDebit: new Prisma.Decimal(0),
          periodCredit: new Prisma.Decimal(0),
        };
        map.set(key, agg);
      }
      return agg;
    };

    for (const item of openingEntries) {
      const agg = getOrCreate(item);
      agg.openingDebit = agg.openingDebit.plus(new Prisma.Decimal(item.voucherEntry.debitAmount.toString()));
      agg.openingCredit = agg.openingCredit.plus(new Prisma.Decimal(item.voucherEntry.creditAmount.toString()));
    }

    for (const item of periodEntries) {
      const agg = getOrCreate(item);
      agg.periodDebit = agg.periodDebit.plus(new Prisma.Decimal(item.voucherEntry.debitAmount.toString()));
      agg.periodCredit = agg.periodCredit.plus(new Prisma.Decimal(item.voucherEntry.creditAmount.toString()));
    }

    const rows: AuxiliaryBalanceRow[] = [];
    for (const agg of map.values()) {
      const openingBal = calculateBalance(agg.openingDebit.minus(agg.openingCredit));
      const closingNet = agg.openingDebit.plus(agg.periodDebit).minus(agg.openingCredit).minus(agg.periodCredit);
      const closingBal = calculateBalance(closingNet);

      const row: AuxiliaryBalanceRow = {
        accountId: agg.accountId,
        accountCode: agg.accountCode,
        accountName: agg.accountName,
        dimensionId: agg.dimensionId,
        dimensionCode: agg.dimensionCode,
        dimensionName: agg.dimensionName,
        memberId: agg.memberId,
        memberCode: agg.memberCode,
        memberName: agg.memberName,
        openingDebit: agg.openingDebit.toString(),
        openingCredit: agg.openingCredit.toString(),
        openingDirection: (openingBal.direction ?? "FLAT") as "DEBIT" | "CREDIT" | "FLAT",
        openingBalance: openingBal.amount,
        periodDebit: agg.periodDebit.toString(),
        periodCredit: agg.periodCredit.toString(),
        closingDebit: agg.openingDebit.plus(agg.periodDebit).toString(),
        closingCredit: agg.openingCredit.plus(agg.periodCredit).toString(),
        closingDirection: (closingBal.direction ?? "FLAT") as "DEBIT" | "CREDIT" | "FLAT",
        closingBalance: closingBal.amount,
      };

      if (query.includeZero || (row.openingBalance !== "0" || row.periodDebit !== "0" || row.periodCredit !== "0" || row.closingBalance !== "0")) {
        rows.push(row);
      }
    }

    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.dimensionCode.localeCompare(b.dimensionCode) || a.memberCode.localeCompare(b.memberCode));
    return { startDate: query.startDate, endDate: query.endDate, rows };
  }
}
