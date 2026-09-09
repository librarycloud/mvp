import type { PrismaClient } from "../../generated/prisma/client.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountBalanceQuery, BalanceAccount, DebitCreditTotal } from "./account-balance.types.js";

export interface AccountBalanceRepository {
  listAccounts(): Promise<BalanceAccount[]>;
  aggregateBefore(startDate: Date): Promise<DebitCreditTotal[]>;
  aggregatePeriod(query: AccountBalanceQuery): Promise<DebitCreditTotal[]>;
  listAuxiliaryEntries(postingDate: { lt?: Date; gte?: Date; lte?: Date }, accountId?: number, dimensionId?: number): Promise<any[]>;
}

export class PrismaAccountBalanceRepository implements AccountBalanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listAccounts() {
    return this.prisma.account.findMany({
      select: {
        id: true, code: true, name: true, category: true, normalDirection: true, parentId: true,
        level: true, sortOrder: true, isEnabled: true, deletedAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  async aggregateBefore(startDate: Date) {
    return this.aggregate({ lt: startDate });
  }

  async aggregatePeriod(query: AccountBalanceQuery) {
    return this.aggregate({ gte: query.startDate, lte: query.endDate });
  }

  async listAuxiliaryEntries(postingDate: { lt?: Date; gte?: Date; lte?: Date }, accountId?: number, dimensionId?: number) {
    return this.prisma.voucherEntryDimension.findMany({
      where: {
        ...(dimensionId ? { dimensionId } : {}),
        voucherEntry: {
          deletedAt: null,
          ...(accountId ? { accountId } : {}),
          voucher: { status: VOUCHER_STATUS.POSTED, deletedAt: null, postingDate },
        },
      },
      include: {
        voucherEntry: {
          select: { accountId: true, debitAmount: true, creditAmount: true, account: { select: { id: true, code: true, name: true, normalDirection: true } } },
        },
        dimension: { select: { id: true, code: true, name: true } },
        dimensionMember: { select: { id: true, code: true, name: true } },
      },
    });
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
