import type { VoucherRepository } from "../../src/modules/voucher/voucher.repository.js";
import type {
  AiSuggestionForVoucher,
  VoucherActor,
  VoucherFilter,
  VoucherMutationRecord,
  VoucherWriteData,
} from "../../src/modules/voucher/voucher.types.js";

export class FakeVoucherRepository implements VoucherRepository {
  postableAccounts = new Set<number>();
  vouchers = new Map<number, VoucherMutationRecord & { data: VoucherWriteData }>();
  suggestions = new Map<number, AiSuggestionForVoucher>();
  attachments: unknown[] = [];
  sequence = 1;

  async findAccountsForPosting(ids: number[]) {
    return new Set(ids.filter((id) => this.postableAccounts.has(id)));
  }

  async findForMutation(id: number) {
    return this.vouchers.get(id) ?? null;
  }

  async findSuggestion(id: number) {
    return this.suggestions.get(id) ?? null;
  }

  async listActiveEntriesForReview(id: number) {
    return (this.vouchers.get(id)?.data.entries ?? []).map((entry) => ({
      accountId: entry.accountId,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
    }));
  }

  async createManual(data: VoucherWriteData, actor: VoucherActor) {
    return this.create(data, actor.actorId, "MANUAL");
  }

  async createFromSuggestion(suggestion: AiSuggestionForVoucher, data: VoucherWriteData, actor: VoucherActor) {
    if (suggestion.status !== 1) throw new Error("Suggestion state changed");
    suggestion.status = 2;
    return this.create(data, actor.actorId, "AI");
  }

  async update(current: VoucherMutationRecord, data: VoucherWriteData, _actor: VoucherActor) {
    const item = this.vouchers.get(current.id)!;
    Object.assign(item, {
      data,
      summary: data.summary,
      category: data.category,
      voucherDate: data.voucherDate,
      fiscalPeriod: data.fiscalPeriod,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
    });
    return item;
  }

  async softDelete(current: VoucherMutationRecord, _actor: VoucherActor): Promise<void> {
    this.vouchers.delete(current.id);
  }

  async changeStatus(current: VoucherMutationRecord, to: 0 | 1 | 2 | 3, actor: VoucherActor, voidReason?: string) {
    const item = this.vouchers.get(current.id)!;
    item.status = to;
    const now = new Date();
    if (to === 1 && current.status !== 0) Object.assign(item, { reviewerId: actor.actorId, reviewedAt: now });
    if (to === 2) Object.assign(item, { postedById: actor.actorId, postedAt: now });
    if (to === 3) Object.assign(item, { voidById: actor.actorId, voidAt: now, voidReason });
    if (to === 0) Object.assign(item, { reviewerId: null, reviewedAt: null, postedById: null, postedAt: null, voidById: null, voidAt: null, voidReason: null });
    return item;
  }

  async list(filter: VoucherFilter) {
    const all = [...this.vouchers.values()];
    const start = (filter.page - 1) * filter.pageSize;
    return { items: all.slice(start, start + filter.pageSize), total: all.length };
  }

  async findById(id: number) {
    return this.vouchers.get(id) ?? null;
  }

  async addAttachment(
    voucher: VoucherMutationRecord,
    file: { originalName: string; storagePath: string; mimeType: string; fileSize: bigint; fileHash: string },
    _actor: VoucherActor,
  ) {
    const item = {
      id: 601,
      voucherId: voucher.id,
      ...file,
      createdAt: new Date(),
    };
    this.attachments.push(item);
    return item;
  }

  private create(data: VoucherWriteData, actorId: number, _source: string) {
    const sequenceNo = this.sequence++;
    const id = sequenceNo + 600;
    const now = new Date();
    const item = {
      id,
      voucherNo: `${data.fiscalYear}-${String(sequenceNo).padStart(6, "0")}`,
      sequenceNo,
      status: 0 as const,
      createdById: actorId,
      summary: data.summary,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.fiscalPeriod,
      voucherDate: data.voucherDate,
      postingDate: data.postingDate,
      periodId: data.periodId ?? 800,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
      sourceType: _source === "MANUAL" ? "MANUAL" : "BANK_TRANSACTION",
      category: data.category,
      attachmentCount: 0,
      reviewerId: null,
      reviewedAt: null,
      postedById: null,
      postedAt: null,
      voidById: null,
      voidAt: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      entries: data.entries.map((entry) => ({
        id: id * 100 + entry.lineNo,
        voucherId: id,
        ...entry,
        account: { id: entry.accountId, code: entry.accountId === debitAccountId ? "6602" : "1002", name: "测试科目" },
      })),
      attachments: [],
      sources: [],
      data,
    };
    this.vouchers.set(id, item);
    return item;
  }
}

export const debitAccountId = 701;
export const creditAccountId = 702;
