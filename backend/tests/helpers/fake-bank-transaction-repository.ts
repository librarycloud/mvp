import type {
  BankImportSummary,
  BankTransactionRepository,
  CreateBankImportInput,
} from "../../src/modules/bank-transaction/bank-transaction.repository.js";
import type {
  BankImportContext,
  BankTransactionFilter,
  ParsedBankTransaction,
} from "../../src/modules/bank-transaction/bank-transaction.types.js";

export class FakeBankTransactionRepository implements BankTransactionRepository {
  transactionNos = new Set<string>();
  transactions: Array<ParsedBankTransaction & {
    id: number;
    importBatchId: number;
    voucherId: number | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }> = [];
  failImport = false;
  lastFilter?: BankTransactionFilter;

  async createImport(input: CreateBankImportInput, _context: BankImportContext): Promise<BankImportSummary> {
    if (this.failImport) throw new Error("Database failure");
    const batchId = 300;
    let successCount = 0;
    for (const transaction of input.transactions) {
      if (this.transactionNos.has(transaction.transactionNo)) continue;
      this.transactionNos.add(transaction.transactionNo);
      successCount += 1;
      this.transactions.push({
        ...transaction,
        id: this.transactions.length + 301,
        importBatchId: batchId,
        voucherId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }
    const skippedCount = input.transactions.length - successCount;
    const failedCount = input.errors.length;
    const status = failedCount === 0 ? 1 : successCount || skippedCount ? 2 : 3;
    return {
      batchId,
      status,
      totalCount: input.totalCount,
      successCount,
      skippedCount,
      failedCount,
      errors: input.errors,
    };
  }

  async list(filter: BankTransactionFilter) {
    this.lastFilter = filter;
    const start = (filter.page - 1) * filter.pageSize;
    return {
      items: this.transactions.slice(start, start + filter.pageSize).map((item) => ({
        ...item,
        voucher: null,
        postingStatus: "UNPOSTED",
        reconciliationStatus: "UNMATCHED",
        reconciledAmount: "0",
      })),
      total: this.transactions.length,
    };
  }

  async findById(id: number) {
    const item = this.transactions.find((transaction) => transaction.id === id);
    return item ? {
      ...item,
      voucher: null,
      postingStatus: "UNPOSTED",
      reconciliationStatus: "UNMATCHED",
      reconciledAmount: "0",
    } : null;
  }

  async linkVoucher(transactionId: number, voucherId: number, _actorId: number): Promise<void> {
    const item = this.transactions.find((t) => t.id === transactionId);
    if (item) {
      item.voucherId = voucherId;
    }
  }
}
