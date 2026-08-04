import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { IMPORT_STATUS, INVOICE_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type {
  InvoiceFilter,
  InvoiceImportContext,
  ParsedInvoice,
} from "./invoice.types.js";

export interface CreateInvoiceImportInput {
  format: "XML" | "OFD" | "PDF";
  originalName: string;
  storagePath: string;
  fileHash: string;
  invoice: ParsedInvoice;
}

export interface InvoiceImportSummary {
  batchId: number;
  invoiceId: number;
  duplicate: boolean;
  invoiceNumber: string;
  itemCount: number;
  periodWarning?: { code: "ACCOUNTING_PERIOD_CLOSED"; message: string; periodId: number; periodCode: string };
}

export interface InvoiceRepository {
  createImport(input: CreateInvoiceImportInput, context: InvoiceImportContext): Promise<InvoiceImportSummary>;
  list(filter: InvoiceFilter): Promise<{ items: unknown[]; total: number }>;
  findById(id: number): Promise<unknown | null>;
  updateTaxDeduction(id: number, status: number, deductibleTaxAmount: string, actorId: number): Promise<unknown>;
  updateStatus(id: number, status: number, actorId: number): Promise<unknown>;
  linkVoucher(invoiceId: number, voucherId: number, actorId: number): Promise<void>;
  unlinkVoucher(invoiceId: number, voucherId: number, actorId: number): Promise<void>;
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createImport(input: CreateInvoiceImportInput, context: InvoiceImportContext) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          type: input.format === "XML" ? "INVOICE_XML" : input.format === "OFD" ? "INVOICE_OFD" : "INVOICE_PDF",
          status: IMPORT_STATUS.PROCESSING,
          originalName: input.originalName,
          storagePath: input.storagePath,
          fileHash: input.fileHash,
          totalCount: 1,
          importedById: context.actorId,
        },
      });
      const profile = await tx.companyProfile.findFirst({ where: { deletedAt: null } });
      const direction =
        profile?.unifiedSocialCreditCode === input.invoice.sellerIdNum
          ? "SALE"
          : profile?.unifiedSocialCreditCode === input.invoice.buyerIdNum
            ? "PURCHASE"
            : "UNKNOWN";
      const created = await tx.invoice.createMany({
        data: [
          {
            importBatchId: batch.id,
            format: input.format,
            direction,
            invoiceType: input.invoice.invoiceType,
            invoiceNumber: input.invoice.invoiceNumber,
            issueTime: input.invoice.issueTime,
            issueDate: input.invoice.issueTime,
            sellerName: input.invoice.sellerName,
            sellerIdNum: input.invoice.sellerIdNum,
            buyerName: input.invoice.buyerName,
            buyerIdNum: input.invoice.buyerIdNum,
            totalAmountWithoutTax: input.invoice.totalAmountWithoutTax,
            totalTaxAmount: input.invoice.totalTaxAmount,
            totalTaxIncludedAmount: input.invoice.totalTaxIncludedAmount,
            currency: input.invoice.currency,
            sourceFileHash: input.fileHash,
            rawData: input.invoice.rawData as Prisma.InputJsonObject,
          },
        ],
        skipDuplicates: true,
      });
      const duplicate = created.count === 0;
      let invoice = await tx.invoice.findUniqueOrThrow({
        where: {
          sellerIdNum_invoiceNumber: {
            sellerIdNum: input.invoice.sellerIdNum,
            invoiceNumber: input.invoice.invoiceNumber,
          },
        },
      });
      if (duplicate && invoice.invoiceType === "UNKNOWN" && input.invoice.invoiceType !== "UNKNOWN") {
        invoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: { invoiceType: input.invoice.invoiceType },
        });
      }
      if (!duplicate) {
        await tx.invoiceItem.createMany({
          data: input.invoice.items.map((item) => ({ ...item, invoiceId: invoice.id })),
        });
      }
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: IMPORT_STATUS.COMPLETED,
          successCount: duplicate ? 0 : 1,
          skippedCount: duplicate ? 1 : 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.actorId,
          action: "IMPORT",
          resourceType: "Invoice",
          resourceId: invoice.id,
          description: duplicate ? "电子发票重复，已跳过" : "电子发票导入成功",
          afterData: {
            invoiceNumber: input.invoice.invoiceNumber,
            format: input.format,
            duplicate,
            itemCount: input.invoice.items.length,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          requestId: context.requestId ?? null,
        },
      });
      return {
        batchId: batch.id,
        invoiceId: invoice.id,
        duplicate,
        invoiceNumber: invoice.invoiceNumber,
        itemCount: duplicate ? 0 : input.invoice.items.length,
      };
    });
  }

  async list(filter: InvoiceFilter) {
    const where = {
      deletedAt: null,
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.startTime || filter.endTime
        ? {
            issueTime: {
              ...(filter.startTime ? { gte: filter.startTime } : {}),
              ...(filter.endTime ? { lte: filter.endTime } : {}),
            },
          }
        : {}),
      ...(filter.keyword
        ? {
            OR: [
              { invoiceNumber: { contains: filter.keyword } },
              { sellerName: { contains: filter.keyword } },
              { buyerName: { contains: filter.keyword } },
              { sellerIdNum: { contains: filter.keyword } },
              { buyerIdNum: { contains: filter.keyword } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          _count: {
            select: {
              items: true,
              voucherSources: { where: { deletedAt: null, voucher: { deletedAt: null, status: { not: VOUCHER_STATUS.VOID } } } },
            },
          },
        },
        orderBy: [{ issueTime: "desc" }, { invoiceNumber: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: number) {
    return this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { where: { deletedAt: null }, orderBy: { lineNo: "asc" } },
        importBatch: { select: { id: true, originalName: true, createdAt: true } },
        voucherSources: {
          where: { deletedAt: null, voucher: { deletedAt: null, status: { not: VOUCHER_STATUS.VOID } } },
          include: {
            voucher: {
              select: { id: true, voucherNo: true, voucherDate: true, postingDate: true, status: true, summary: true, totalDebit: true, totalCredit: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async linkVoucher(invoiceId: number, voucherId: number, actorId: number) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, select: { id: true, status: true, reimbursementId: true, voucherId: true } });
      if (!invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
      if (invoice.status === INVOICE_STATUS.VOIDED) throw new AppError("INVOICE_VOIDED", "已作废发票不能关联凭证", 409);
      if (invoice.reimbursementId) throw new AppError("INVOICE_REIMBURSEMENT_MANAGED", "该发票正由报销单管理，不能手工修改凭证关联", 409);
      const voucher = await tx.voucher.findFirst({ where: { id: voucherId, deletedAt: null }, select: { id: true, voucherNo: true, status: true } });
      if (!voucher) throw new AppError("VOUCHER_NOT_FOUND", "凭证不存在", 404);
      if (voucher.status !== VOUCHER_STATUS.POSTED) throw new AppError("VOUCHER_NOT_POSTED", "只能关联已记账凭证", 409);
      const existing = await tx.voucherSource.findUnique({ where: { voucherId_invoiceId: { voucherId, invoiceId } } });
      if (existing?.deletedAt === null) throw new AppError("INVOICE_VOUCHER_ALREADY_LINKED", "该发票已经关联此凭证", 409);
      if (existing) await tx.voucherSource.update({ where: { id: existing.id }, data: { deletedAt: null } });
      else await tx.voucherSource.create({ data: { voucherId, invoiceId } });
      if (!invoice.voucherId) await tx.invoice.update({ where: { id: invoiceId }, data: { voucherId } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "Invoice", resourceId: invoiceId, description: "关联已有凭证", afterData: { voucherId, voucherNo: voucher.voucherNo } } });
    });
  }

  async unlinkVoucher(invoiceId: number, voucherId: number, actorId: number) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, deletedAt: null }, select: { id: true, reimbursementId: true, voucherId: true } });
      if (!invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
      if (invoice.reimbursementId) throw new AppError("INVOICE_REIMBURSEMENT_MANAGED", "该发票正由报销单管理，不能手工修改凭证关联", 409);
      const source = await tx.voucherSource.findFirst({ where: { invoiceId, voucherId, deletedAt: null }, include: { voucher: { select: { voucherNo: true, status: true } } } });
      if (!source) throw new AppError("INVOICE_VOUCHER_LINK_NOT_FOUND", "未找到发票与凭证的关联", 404);
      if (source.voucher.status === VOUCHER_STATUS.VOID) throw new AppError("VOID_VOUCHER_LINK_MANAGED", "作废凭证的来源关联由凭证恢复流程管理", 409);
      await tx.voucherSource.update({ where: { id: source.id }, data: { deletedAt: new Date() } });
      if (invoice.voucherId === voucherId) {
        const replacement = await tx.voucherSource.findFirst({
          where: { invoiceId, deletedAt: null, voucher: { deletedAt: null, status: { not: VOUCHER_STATUS.VOID } } },
          select: { voucherId: true },
          orderBy: { createdAt: "asc" },
        });
        await tx.invoice.update({ where: { id: invoiceId }, data: { voucherId: replacement?.voucherId ?? null } });
      }
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "Invoice", resourceId: invoiceId, description: "解除凭证关联", beforeData: { voucherId, voucherNo: source.voucher.voucherNo } } });
    });
  }

  async updateTaxDeduction(id: number, status: number, deductibleTaxAmount: string, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { id, deletedAt: null } });
        if (!invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
      const updated = await tx.invoice.update({ where: { id }, data: { taxDeductionStatus: status, deductibleTaxAmount } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "Invoice", resourceId: id, description: "更新发票抵扣处理", afterData: { status, deductibleTaxAmount } } });
      return updated;
    });
  }
  async updateStatus(id: number, status: number, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const invoice = await tx.invoice.findFirst({ where: { id, deletedAt: null } });
      if (!invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
      if (invoice.status === INVOICE_STATUS.VOIDED && status === INVOICE_STATUS.VERIFIED) throw new AppError("INVOICE_VOIDED", "已作废发票不能重新核验", 409);
      if (status === INVOICE_STATUS.VOIDED && (invoice.voucherId || invoice.reimbursementId)) throw new AppError("INVOICE_IN_USE", "已用于报销或入账的发票不能作废", 409);
      const updated = await tx.invoice.update({ where: { id }, data: status === INVOICE_STATUS.VERIFIED ? { status, verificationStatus: "VERIFIED", verificationMessage: "已人工核验", verifiedAt: new Date(), verifiedById: actorId } : { status, voidedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, action: status === 2 ? "DELETE" : "UPDATE", resourceType: "Invoice", resourceId: id, description: status === 2 ? "作废发票" : "人工核验发票" } });
      return updated;
    });
  }
}
