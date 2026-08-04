import type { PrismaClient } from "../../generated/prisma/client.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { LedgerAccount, LedgerEntryRecord, LedgerQuery } from "./general-ledger.types.js";

export interface GeneralLedgerRepository {
  findAccount(id: number): Promise<LedgerAccount | null>;
  openingTotals(accountId: number, startDate: Date): Promise<{ debit: string; credit: string }>;
  listEntries(query: LedgerQuery): Promise<LedgerEntryRecord[]>;
}

export class PrismaGeneralLedgerRepository implements GeneralLedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAccount(id: number) {
    return this.prisma.account.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, normalDirection: true },
    });
  }

  async openingTotals(accountId: number, startDate: Date) {
    const total = await this.prisma.voucherEntry.aggregate({
      where: {
        accountId,
        deletedAt: null,
        voucher: { status: VOUCHER_STATUS.POSTED, deletedAt: null, postingDate: { lt: startDate } },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return {
      debit: total._sum.debitAmount?.toString() ?? "0",
      credit: total._sum.creditAmount?.toString() ?? "0",
    };
  }

  async listEntries(query: LedgerQuery) {
    const entries = await this.prisma.voucherEntry.findMany({
      where: {
        accountId: query.accountId,
        deletedAt: null,
        voucher: {
          status: VOUCHER_STATUS.POSTED,
          deletedAt: null,
          postingDate: { gte: query.startDate, lte: query.endDate },
        },
      },
      include: { voucher: { select: { id: true, voucherNo: true, voucherDate: true, postingDate: true, sequenceNo: true } } },
      orderBy: [
        { voucher: { postingDate: "asc" } },
        { voucher: { sequenceNo: "asc" } },
        { lineNo: "asc" },
      ],
    });
    return entries.map((entry) => ({
      voucherId: entry.voucher.id,
      voucherNo: entry.voucher.voucherNo,
      voucherDate: entry.voucher.postingDate,
      sequenceNo: entry.voucher.sequenceNo,
      lineNo: entry.lineNo,
      summary: entry.summary,
      debitAmount: entry.debitAmount.toString(),
      creditAmount: entry.creditAmount.toString(),
    }));
  }
}
