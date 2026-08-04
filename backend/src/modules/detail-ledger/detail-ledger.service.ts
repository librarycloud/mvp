import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { calculateBalance } from "../ledger/ledger-balance.js";
import type { DetailLedgerRepository } from "./detail-ledger.repository.js";
import type { DetailLedgerEntry, DetailLedgerQuery } from "./detail-ledger.types.js";

export class DetailLedgerService {
  constructor(private readonly repository: DetailLedgerRepository) {}

  async getLedger(query: DetailLedgerQuery) {
    if (query.startDate > query.endDate) {
      throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    }
    if ((query.auxiliaryKey && !query.auxiliaryValue) || (!query.auxiliaryKey && query.auxiliaryValue)) {
      throw new AppError("INVALID_AUXILIARY_FILTER", "辅助核算键和值必须同时提供", 400);
    }
    const account = await this.repository.findAccount(query.accountId);
    if (!account) throw new AppError("ACCOUNT_NOT_FOUND", "会计科目不存在", 404);
    const [before, period] = await Promise.all([
      this.repository.listBefore(query.accountId, query.startDate),
      this.repository.listPeriod(query),
    ]);
    if (before.length > 10000 || period.length > 10000) {
      throw new AppError("DETAIL_LEDGER_TOO_LARGE", "查询范围内分录过多，请缩小日期范围", 400);
    }
    const filter = (entry: DetailLedgerEntry) => this.matchesAuxiliary(entry, query);
    const openingEntries = before.filter(filter);
    const periodEntries = period.filter(filter);
    let netDebit = openingEntries.reduce(
      (sum, entry) => sum.plus(entry.debitAmount).minus(entry.creditAmount),
      new Prisma.Decimal(0),
    );
    const opening = calculateBalance(netDebit);
    let periodDebit = new Prisma.Decimal(0);
    let periodCredit = new Prisma.Decimal(0);
    const lines = periodEntries.map((entry) => {
      const debit = new Prisma.Decimal(entry.debitAmount);
      const credit = new Prisma.Decimal(entry.creditAmount);
      periodDebit = periodDebit.plus(debit);
      periodCredit = periodCredit.plus(credit);
      netDebit = netDebit.plus(debit).minus(credit);
      const balance = calculateBalance(netDebit);
      return {
        ...entry,
        balanceDirection: balance.direction,
        balance: balance.amount,
      };
    });
    return {
      account,
      startDate: query.startDate,
      endDate: query.endDate,
      auxiliary: query.auxiliaryKey
        ? { key: query.auxiliaryKey, value: query.auxiliaryValue! }
        : null,
      opening,
      periodDebit: periodDebit.toString(),
      periodCredit: periodCredit.toString(),
      closing: calculateBalance(netDebit),
      lines,
    };
  }

  private matchesAuxiliary(entry: DetailLedgerEntry, query: DetailLedgerQuery): boolean {
    if (!query.auxiliaryKey) return true;
    const key = query.auxiliaryKey!.toLocaleLowerCase();
    const value = query.auxiliaryValue!.toLocaleLowerCase();
    return entry.dimensions.some((item) =>
      [item.dimensionCode, item.dimensionName].some((candidate) => candidate.toLocaleLowerCase() === key) &&
      [item.memberCode, item.memberName].some((candidate) => candidate.toLocaleLowerCase() === value),
    );
  }
}
