import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { calculateBalance } from "../ledger/ledger-balance.js";
import type { GeneralLedgerRepository } from "./general-ledger.repository.js";
import type { LedgerQuery } from "./general-ledger.types.js";

export class GeneralLedgerService {
  constructor(private readonly repository: GeneralLedgerRepository) {}

  async getLedger(query: LedgerQuery) {
    if (query.startDate > query.endDate) {
      throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    }
    const account = await this.repository.findAccount(query.accountId);
    if (!account) throw new AppError("ACCOUNT_NOT_FOUND", "会计科目不存在", 404);
    const [opening, entries] = await Promise.all([
      this.repository.openingTotals(query.accountId, query.startDate),
      this.repository.listEntries(query),
    ]);
    if (entries.length > 10000) {
      throw new AppError("GENERAL_LEDGER_TOO_LARGE", "查询范围内分录过多，请缩小日期范围", 400);
    }

    let debitTotal = new Prisma.Decimal(opening.debit);
    let creditTotal = new Prisma.Decimal(opening.credit);
    let netDebit = debitTotal.minus(creditTotal);
    const openingBalance = calculateBalance(netDebit);
    const lines = entries.map((entry) => {
      const debit = new Prisma.Decimal(entry.debitAmount);
      const credit = new Prisma.Decimal(entry.creditAmount);
      debitTotal = debitTotal.plus(debit);
      creditTotal = creditTotal.plus(credit);
      netDebit = netDebit.plus(debit).minus(credit);
      return {
        ...entry,
        debitAmount: debit.toString(),
        creditAmount: credit.toString(),
        balanceDirection: calculateBalance(netDebit).direction,
        balance: calculateBalance(netDebit).amount,
      };
    });
    const closingBalance = calculateBalance(netDebit);
    return {
      account,
      startDate: query.startDate,
      endDate: query.endDate,
      opening: openingBalance,
      periodDebit: debitTotal.minus(opening.debit).toString(),
      periodCredit: creditTotal.minus(opening.credit).toString(),
      closing: closingBalance,
      lines,
    };
  }

}
