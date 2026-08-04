import type { PrismaClient } from "../../generated/prisma/client.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type {
  DetailLedgerAccount,
  DetailLedgerEntry,
  DetailLedgerQuery,
} from "./detail-ledger.types.js";

export interface DetailLedgerRepository {
  findAccount(id: number): Promise<DetailLedgerAccount | null>;
  listBefore(accountId: number, startDate: Date): Promise<DetailLedgerEntry[]>;
  listPeriod(query: DetailLedgerQuery): Promise<DetailLedgerEntry[]>;
}

export class PrismaDetailLedgerRepository implements DetailLedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAccount(id: number) {
    return this.prisma.account.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, normalDirection: true },
    });
  }

  async listBefore(accountId: number, startDate: Date) {
    return this.entries({ accountId, voucher: { postingDate: { lt: startDate } } });
  }

  async listPeriod(query: DetailLedgerQuery) {
    return this.entries({
      accountId: query.accountId,
      voucher: { postingDate: { gte: query.startDate, lte: query.endDate } },
    });
  }

  private async entries(where: {
    accountId: number;
    voucher: { postingDate: { lt?: Date; gte?: Date; lte?: Date } };
  }) {
    const entries = await this.prisma.voucherEntry.findMany({
      where: {
        accountId: where.accountId,
        deletedAt: null,
        voucher: { status: VOUCHER_STATUS.POSTED, deletedAt: null, ...where.voucher },
      },
      include: {
        voucher: { select: { id: true, voucherNo: true, voucherDate: true, postingDate: true, sequenceNo: true, summary: true } },
        dimensions: {
          include: {
            dimension: { select: { id: true, code: true, name: true } },
            dimensionMember: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [
        { voucher: { postingDate: "asc" } },
        { voucher: { sequenceNo: "asc" } },
        { lineNo: "asc" },
      ],
      take: 10001,
    });
    return entries.map((entry) => ({
      voucherId: entry.voucher.id,
      voucherNo: entry.voucher.voucherNo,
      voucherDate: entry.voucher.postingDate,
      sequenceNo: entry.voucher.sequenceNo,
      voucherSummary: entry.voucher.summary,
      lineNo: entry.lineNo,
      entrySummary: entry.summary,
      debitAmount: entry.debitAmount.toString(),
      creditAmount: entry.creditAmount.toString(),
      dimensions: entry.dimensions.map((item) => ({
        dimensionId: item.dimension.id,
        dimensionCode: item.dimension.code,
        dimensionName: item.dimension.name,
        memberId: item.dimensionMember.id,
        memberCode: item.dimensionMember.code,
        memberName: item.dimensionMember.name,
      })),
    }));
  }
}
