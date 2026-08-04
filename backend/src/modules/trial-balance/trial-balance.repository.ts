import type { PrismaClient } from "../../generated/prisma/client.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { TrialAccount, TrialBalanceQuery, TrialDebitCreditTotal } from "./trial-balance.types.js";

export interface TrialBalanceRepository {
  listAccounts(): Promise<TrialAccount[]>;
  aggregateBefore(startDate: Date): Promise<TrialDebitCreditTotal[]>;
  aggregatePeriod(query: TrialBalanceQuery): Promise<TrialDebitCreditTotal[]>;
}

export class PrismaTrialBalanceRepository implements TrialBalanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listAccounts() {
    return this.prisma.account.findMany({
      select: { id: true, code: true, name: true, category: true, normalDirection: true, isLeaf: true, sortOrder: true, deletedAt: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  async aggregateBefore(startDate: Date) {
    return this.aggregate({ lt: startDate });
  }

  async aggregatePeriod(query: TrialBalanceQuery) {
    return this.aggregate({ gte: query.startDate, lte: query.endDate });
  }

  private async aggregate(postingDate: { lt?: Date; gte?: Date; lte?: Date }) {
    const rows = await this.prisma.voucherEntry.groupBy({
      by: ["accountId"],
      where: { deletedAt: null, voucher: { status: VOUCHER_STATUS.POSTED, deletedAt: null, postingDate } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return rows.map((row) => ({
      accountId: row.accountId,
      debit: row._sum?.debitAmount?.toString() ?? "0",
      credit: row._sum?.creditAmount?.toString() ?? "0",
    }));
  }
}
