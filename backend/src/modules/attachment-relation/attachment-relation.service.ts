import { createHash } from "node:crypto";
import path from "node:path";
import { AppError } from "../../common/errors/app-error.js";
import type { FileStorage } from "../../infrastructure/storage/file-storage.js";
import type { AttachmentActor, AttachmentRelationType, AttachmentRepository, AttachmentSourceType } from "./attachment-relation.types.js";

const sources = new Set<AttachmentSourceType>(["Voucher", "Invoice", "BankTransaction", "AccountingEvent", "FixedAsset", "Reimbursement", "Salary", "Company", "System", "Other"]);
const relationTypes = new Set<AttachmentRelationType>(["ORIGINAL", "SOURCE", "GENERATED", "REFERENCE", "RECEIPT", "CONTRACT", "OTHER"]);

export class AttachmentRelationService {
  constructor(private readonly repository: AttachmentRepository, private readonly storage: FileStorage) {}

  async uploadAndRelate(
    file: { originalName: string; mimeType: string; data: Buffer },
    input: { sourceType: AttachmentSourceType; sourceId: number; relationType: AttachmentRelationType; remark?: string | null; category?: string | null },
    actor: AttachmentActor,
  ) {
    this.validate(input.sourceType, input.relationType, input.sourceId);
    await this.assertSourceAccess(input.sourceType, actor, true);
    await this.assertSourceExists(input.sourceType, input.sourceId);
    if (!file.data.length) throw new AppError("EMPTY_ATTACHMENT", "附件为空", 400);
    const extension = path.extname(file.originalName).slice(1).toLowerCase() || "bin";
    const sha256 = createHash("sha256").update(file.data).digest("hex");
    const stored = await this.storage.saveVoucherAttachment(extension, sha256, file.data);
    try {
      const attachment = await this.repository.findOrCreate({
        fileName: `${sha256}.${extension}`,
        originalName: path.basename(file.originalName),
        extension,
        mimeType: file.mimeType || "application/octet-stream",
        size: BigInt(file.data.length),
        sha256,
        storagePath: stored.storagePath,
        category: input.category ?? null,
        uploadedById: actor.actorId,
      });
      const relation = await this.repository.createRelation({
        attachmentId: attachment.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        relationType: input.relationType,
        remark: input.remark ?? null,
        createdById: actor.actorId,
      });
      return { attachmentId: attachment.id, reused: !attachment.created, relation };
    } catch (error) {
      if (stored.created) await this.storage.remove(stored.storagePath);
      throw error;
    }
  }

  async listSource(sourceType: AttachmentSourceType, sourceId: number, actor: AttachmentActor) {
    this.validate(sourceType, "OTHER", sourceId);
    await this.assertSourceAccess(sourceType, actor, false);
    await this.assertSourceExists(sourceType, sourceId);
    return this.repository.listSource(sourceType, sourceId);
  }

  async listRelations(attachmentId: number, actor: AttachmentActor) {
    await this.assertAttachmentAccess(attachmentId, actor);
    return this.repository.listAttachmentRelations(attachmentId);
  }

  async getContent(attachmentId: number, actor: AttachmentActor) {
    await this.assertAttachmentAccess(attachmentId, actor);
    const attachment = await this.repository.findFile(attachmentId);
    if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", "附件不存在或已被移除", 404);
    try {
      return { ...attachment, data: await this.storage.read(attachment.storagePath) };
    } catch {
      throw new AppError("ATTACHMENT_FILE_NOT_FOUND", "附件文件不存在，请联系管理员检查上传目录", 404);
    }
  }

  async unlink(id: number, actor: AttachmentActor) {
    const relation = await this.repository.findRelation?.(id);
    if (relation) await this.assertSourceAccess(relation.sourceType, actor, true);
    const result = await this.repository.removeRelation(id, actor);
    if (result.storagePath) await this.storage.remove(result.storagePath);
  }

  private validate(sourceType: string, relationType: string, sourceId: number) {
    if (!sources.has(sourceType as AttachmentSourceType) || !relationTypes.has(relationType as AttachmentRelationType) || !Number.isInteger(sourceId) || sourceId < 1) {
      throw new AppError("INVALID_ATTACHMENT_RELATION", "附件关联参数无效", 400);
    }
  }

  private async assertSourceExists(sourceType: AttachmentSourceType, sourceId: number) {
    if (this.repository.sourceExists && !(await this.repository.sourceExists(sourceType, sourceId))) {
      throw new AppError("ATTACHMENT_SOURCE_NOT_FOUND", "附件关联的业务单据不存在", 404);
    }
  }

  private async assertAttachmentAccess(attachmentId: number, actor: AttachmentActor) {
    const relations = await this.repository.listAttachmentRelations(attachmentId) as Array<{ sourceType?: AttachmentSourceType; sourceId?: number }>;
    if (!relations.length) throw new AppError("ATTACHMENT_NOT_FOUND", "附件不存在或已被移除", 404);
    for (const relation of relations) {
      if (relation.sourceType) await this.assertSourceAccess(relation.sourceType, actor, false);
    }
  }

  private async assertSourceAccess(sourceType: AttachmentSourceType, actor: AttachmentActor, write: boolean) {
    if (["Salary", "Company", "System"].includes(sourceType) && actor.role !== "ADMIN" && actor.role !== "FINANCE_MANAGER") {
      throw new AppError("FORBIDDEN", "无权访问该类型的附件", 403);
    }
    if (write && sourceType === "Voucher" && actor.role === "CASHIER") {
      throw new AppError("FORBIDDEN", "出纳不能修改凭证附件", 403);
    }
  }
}
