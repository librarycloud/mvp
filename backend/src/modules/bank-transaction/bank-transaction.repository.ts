import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { IMPORT_STATUS } from "../../common/status-codes.js";
import type {
  BankImportContext,
  BankImportError,
  BankTransactionFilter,
  ParsedBankTransaction,
} from "./bank-transaction.types.js";

export interface CreateBankImportInput {
  type: "BANK_XLSX" | "BANK_CSV" | "BANK_JSON";
  originalName: string;
  storagePath: string;
  fileHash: string;
  totalCount: number;
  transactions: ParsedBankTransaction[];
  errors: BankImportError[];
}

export interface BankImportSummary {
  batchId: number;
  status: number;
  totalCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  errors: BankImportError[];
  periodWarnings?: Array<{ code: "ACCOUNTING_PERIOD_CLOSED"; message: string; periodId: number; periodCode: string; transactionNo: string }>;
}

export interface BankTransactionRepository {
  createImport(input: CreateBankImportInput, context: BankImportContext): Promise<BankImportSummary>;
  list(filter: BankTransactionFilter): Promise<{ items: unknown[]; total: number }>;
  findById(id: number): Promise<unknown | null>;
}

export class PrismaBankTransactionRepository implements BankTransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createImport(input: CreateBankImportInput, context: BankImportContext) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          type: input.type,
          status: IMPORT_STATUS.PROCESSING,
          originalName: input.originalName,
          storagePath: input.storagePath,
          fileHash: input.fileHash,
          totalCount: input.totalCount,
          importedById: context.actorId,
        },
      });
      const inserted = await tx.bankTransaction.createMany({
        data: input.transactions.map((item) => ({
          importBatchId: batch.id,
          payerAccount: item.payerAccount,
          payerName: item.payerName,
          payerBank: item.payerBank,
          payerCurrency: item.payerCurrency,
          payeeAccount: item.payeeAccount,
          payeeName: item.payeeName,
          payeeBank: item.payeeBank,
          payeeCurrency: item.payeeCurrency,
          amount: item.amount,
          balance: item.balance,
          transactionTime: item.transactionTime,
          transactionDate: item.transactionTime,
          transactionNo: item.transactionNo,
          transactionType: item.transactionType,
          summary: item.summary,
          rawData: item.rawData,
        })),
        skipDuplicates: true,
      });
      const failedCount = input.errors.length;
      const skippedCount = input.transactions.length - inserted.count;
      const status = this.status(inserted.count, skippedCount, failedCount);
      const errors = input.errors.slice(0, 100);
      const errorJson = errors.map((item) => ({
        row: item.row,
        message: item.message,
        transactionNo: item.transactionNo ?? null,
      }));
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status,
          successCount: inserted.count,
          skippedCount,
          failedCount,
          errorSummary:
            failedCount > 0
              ? { errors: errorJson, truncated: failedCount > errors.length }
              : Prisma.JsonNull,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.actorId,
          action: "IMPORT",
          resourceType: "BankTransaction",
          resourceId: batch.id,
          description: `银行流水导入：成功${inserted.count}，跳过${skippedCount}，失败${failedCount}`,
          afterData: { totalCount: input.totalCount, successCount: inserted.count, skippedCount, failedCount },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          requestId: context.requestId ?? null,
        },
      });
      return {
        batchId: batch.id,
        status,
        totalCount: input.totalCount,
        successCount: inserted.count,
        skippedCount,
        failedCount,
        errors,
      };
    });
  }

  async list(filter: BankTransactionFilter) {
    const where = {
      deletedAt: null,
      ...(filter.startTime || filter.endTime
        ? {
            transactionTime: {
              ...(filter.startTime ? { gte: filter.startTime } : {}),
              ...(filter.endTime ? { lte: filter.endTime } : {}),
            },
          }
        : {}),
      ...(filter.keyword
        ? {
            OR: [
              { transactionNo: { contains: filter.keyword } },
              { payerName: { contains: filter.keyword } },
              { payeeName: { contains: filter.keyword } },
              { summary: { contains: filter.keyword } },
            ],
          }
        : {}),
      ...(filter.voucherStatus === "UNPOSTED" ? { voucherId: null } : {}),
      ...(filter.voucherStatus === "VOUCHERED" ? { voucherId: { not: null } } : {}),
      ...(filter.reconciliationStatus === "UNMATCHED"
        ? { reconciliationMatches: { none: { deletedAt: null } } }
        : {}),
      ...(filter.reconciliationStatus === "MATCHED"
        ? { reconciliationMatches: { some: { deletedAt: null } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where,
        include: {
          voucher: { select: { id: true, voucherNo: true, status: true } },
          reconciliationMatches: {
            where: { deletedAt: null },
            select: { matchedAmount: true },
          },
        },
        orderBy: [{ transactionTime: "desc" }, { transactionNo: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return {
      items: items.map(({ reconciliationMatches, ...item }) => {
        const reconciledAmount = reconciliationMatches.reduce(
          (sum, match) => sum.plus(match.matchedAmount),
          new Prisma.Decimal(0),
        );
        const reconciliationStatus = reconciledAmount.equals(0)
          ? "UNMATCHED"
          : reconciledAmount.greaterThanOrEqualTo(item.amount.abs())
            ? "MATCHED"
            : "PARTIAL";
        return {
          ...item,
          postingStatus: item.voucherId ? "VOUCHERED" : "UNPOSTED",
          reconciliationStatus,
          reconciledAmount: reconciledAmount.toString(),
        };
      }),
      total,
    };
  }

  async findById(id: number) {
    const item = await this.prisma.bankTransaction.findFirst({
      where: { id, deletedAt: null },
      include: {
        importBatch: { select: { id: true, originalName: true, createdAt: true } },
        voucher: { select: { id: true, voucherNo: true, status: true } },
        reconciliationMatches: {
          where: { deletedAt: null },
          select: { matchedAmount: true },
        },
      },
    });
    if (!item) return null;
    const { reconciliationMatches, ...transaction } = item;
    const reconciledAmount = reconciliationMatches.reduce(
      (sum, match) => sum.plus(match.matchedAmount),
      new Prisma.Decimal(0),
    );
    return {
      ...transaction,
      postingStatus: transaction.voucherId ? "VOUCHERED" : "UNPOSTED",
      reconciliationStatus: reconciledAmount.equals(0)
        ? "UNMATCHED"
        : reconciledAmount.greaterThanOrEqualTo(transaction.amount.abs())
          ? "MATCHED"
          : "PARTIAL",
      reconciledAmount: reconciledAmount.toString(),
    };
  }

  private status(inserted: number, skipped: number, failed: number): BankImportSummary["status"] {
    if (failed === 0) return IMPORT_STATUS.COMPLETED;
    if (inserted === 0 && skipped === 0) return IMPORT_STATUS.FAILED;
    return IMPORT_STATUS.PARTIALLY_COMPLETED;
  }
}
