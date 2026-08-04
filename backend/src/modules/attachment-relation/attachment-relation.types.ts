import type { AuthRole } from "../auth/auth.types.js";
export type AttachmentSourceType = "Voucher" | "Invoice" | "BankTransaction" | "AccountingEvent" | "FixedAsset" | "Reimbursement" | "Salary" | "Company" | "System" | "Other";
export type AttachmentRelationType = "ORIGINAL" | "SOURCE" | "GENERATED" | "REFERENCE" | "RECEIPT" | "CONTRACT" | "OTHER";
export interface AttachmentActor { actorId: number; role: AuthRole; requestId?: string; ipAddress?: string; userAgent?: string; }
export interface AttachmentRepository {
  findOrCreate(input: { fileName: string; originalName: string; extension: string; mimeType: string; size: bigint; sha256: string; storagePath: string; category?: string | null; uploadedById: number }): Promise<{ id: number; storagePath: string; created: boolean }>;
  findFile(id: number): Promise<{ id: number; originalName: string; extension: string; mimeType: string; storagePath: string } | null>;
  createRelation(input: { attachmentId: number; sourceType: AttachmentSourceType; sourceId: number; relationType: AttachmentRelationType; remark?: string | null; createdById: number }): Promise<unknown>;
  listSource(sourceType: AttachmentSourceType, sourceId: number): Promise<unknown[]>;
  listAttachmentRelations(attachmentId: number): Promise<unknown[]>;
  removeRelation(id: number, actor?: AttachmentActor): Promise<{ storagePath: string | null }>;
  findRelation?(id: number): Promise<{ sourceType: AttachmentSourceType; sourceId: number } | null>;
  sourceExists?(sourceType: AttachmentSourceType, sourceId: number): Promise<boolean>;
}
