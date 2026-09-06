import type {
  AiSuggestionForVoucher,
  VoucherActor,
  VoucherFilter,
  VoucherMutationRecord,
  VoucherWriteData,
} from "./voucher.types.js";

export interface VoucherRepository {
  findAccountsForPosting(ids: number[]): Promise<Set<number>>;
  findForMutation(id: number): Promise<VoucherMutationRecord | null>;
  findManagedSource?(id: number): Promise<{ eventType: string; sourceType: string | null } | null>;
  findOperationMode?(): Promise<"SIMPLE" | "STANDARD">;
  findSuggestion(id: number): Promise<AiSuggestionForVoucher | null>;
  listActiveEntriesForReview(
    id: number,
  ): Promise<Array<{ accountId: number; debitAmount: string; creditAmount: string }>>;
  createManual(data: VoucherWriteData, actor: VoucherActor): Promise<unknown>;
  createFromSuggestion(
    suggestion: AiSuggestionForVoucher,
    data: VoucherWriteData,
    actor: VoucherActor,
  ): Promise<unknown>;
  update(current: VoucherMutationRecord, data: VoucherWriteData, actor: VoucherActor): Promise<unknown>;
  softDelete(current: VoucherMutationRecord, actor: VoucherActor): Promise<void>;
  changeStatus(current: VoucherMutationRecord, to: number, actor: VoucherActor, voidReason?: string): Promise<unknown>;
  list(filter: VoucherFilter): Promise<{ items: unknown[]; total: number }>;
  findById(id: number): Promise<unknown | null>;
  addAttachment(
    voucher: VoucherMutationRecord,
    file: {
      originalName: string;
      storagePath: string;
      mimeType: string;
      fileSize: bigint;
      fileHash: string;
    },
    actor: VoucherActor,
  ): Promise<unknown>;
}
