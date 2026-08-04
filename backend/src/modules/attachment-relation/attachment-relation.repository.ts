import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { AttachmentRepository, AttachmentSourceType, AttachmentRelationType } from "./attachment-relation.types.js";
export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findOrCreate(input: { fileName: string; originalName: string; extension: string; mimeType: string; size: bigint; sha256: string; storagePath: string; category?: string | null; uploadedById: number }) { const existing = await this.prisma.attachment.findFirst({ where: { sha256: input.sha256, deletedAt: null }, select: { id: true, storagePath: true } }); if (existing) return { ...existing, created: false }; const row = await this.prisma.attachment.create({ data: input }); return { id: row.id, storagePath: row.storagePath, created: true }; }
  findFile(id: number) { return this.prisma.attachment.findFirst({ where: { id, deletedAt: null }, select: { id: true, originalName: true, extension: true, mimeType: true, storagePath: true } }); }
  async findRelation(id: number) {
    const row = await this.prisma.attachmentRelation.findFirst({ where: { id, deletedAt: null }, select: { sourceType: true, sourceId: true } });
    return row ? { sourceType: row.sourceType as AttachmentSourceType, sourceId: row.sourceId } : null;
  }
  async sourceExists(sourceType: AttachmentSourceType, sourceId: number) {
    if (sourceType === "System" || sourceType === "Other") return true;
    const where = { id: sourceId, deletedAt: null };
    switch (sourceType) {
      case "Voucher": return Boolean(await this.prisma.voucher.findFirst({ where, select: { id: true } }));
      case "Invoice": return Boolean(await this.prisma.invoice.findFirst({ where, select: { id: true } }));
      case "BankTransaction": return Boolean(await this.prisma.bankTransaction.findFirst({ where, select: { id: true } }));
      case "AccountingEvent": return Boolean(await this.prisma.accountingEvent.findFirst({ where, select: { id: true } }));
      case "FixedAsset": return Boolean(await this.prisma.fixedAsset.findFirst({ where, select: { id: true } }));
      case "Reimbursement": return Boolean(await this.prisma.reimbursement.findFirst({ where, select: { id: true } }));
      case "Salary": return Boolean(await this.prisma.salary.findFirst({ where, select: { id: true } }));
      case "Company": return Boolean(await this.prisma.companyProfile.findFirst({ where, select: { id: true } }));
    }
    return false;
  }
  async createRelation(input: { attachmentId: number; sourceType: AttachmentSourceType; sourceId: number; relationType: AttachmentRelationType; remark?: string | null; createdById: number }) {
    return this.prisma.$transaction(async tx => {
      const found = await tx.attachmentRelation.findFirst({ where: { attachmentId: input.attachmentId, sourceType: input.sourceType, sourceId: input.sourceId, relationType: input.relationType, deletedAt: null } });
      const relation = found ?? await tx.attachmentRelation.create({ data: input });
      await tx.auditLog.create({ data: { actorId: input.createdById, action: found ? "UPDATE" : "CREATE", resourceType: "AttachmentRelation", resourceId: relation.id, description: found ? "Reuse existing attachment relation" : "Create attachment relation", afterData: { attachmentId: input.attachmentId, sourceType: input.sourceType, sourceId: input.sourceId, relationType: input.relationType } } });
      return relation;
    });
  }
  async listSource(sourceType: AttachmentSourceType, sourceId: number) {
    const rows = await this.prisma.attachmentRelation.findMany({ where: { sourceType, sourceId, deletedAt: null, attachment: { deletedAt: null } }, include: { attachment: true }, orderBy: { createdAt: "asc" } });
    return rows.map(row => ({ ...row, attachment: { ...row.attachment, size: row.attachment.size.toString() } }));
  }
  listAttachmentRelations(attachmentId: number) { return this.prisma.attachmentRelation.findMany({ where: { attachmentId, deletedAt: null }, orderBy: { createdAt: "asc" } }); }
  async removeRelation(id: number, actor?: import("./attachment-relation.types.js").AttachmentActor) {
    return this.prisma.$transaction(async tx => {
      const relation = await tx.attachmentRelation.findFirst({ where: { id, deletedAt: null }, include: { attachment: true } });
      if (!relation) return { storagePath: null };
      await tx.attachmentRelation.update({ where: { id }, data: { deletedAt: new Date() } });
      const count = await tx.attachmentRelation.count({ where: { attachmentId: relation.attachmentId, deletedAt: null } });
      if (!count) await tx.attachment.update({ where: { id: relation.attachmentId }, data: { deletedAt: new Date() } });
      if (actor) await tx.auditLog.create({ data: { actorId: actor.actorId, action: "DELETE", resourceType: "AttachmentRelation", resourceId: id, description: "Remove attachment relation", beforeData: { attachmentId: relation.attachmentId, sourceType: relation.sourceType, sourceId: relation.sourceId, relationType: relation.relationType }, requestId: actor.requestId ?? null, ipAddress: actor.ipAddress ?? null, userAgent: actor.userAgent ?? null } });
      return { storagePath: count ? null : relation.attachment.storagePath };
    });
  }
}
