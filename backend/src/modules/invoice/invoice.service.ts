import { createHash } from "node:crypto";
import path from "node:path";
import { AppError } from "../../common/errors/app-error.js";
import { ACCOUNTING_PERIOD_STATUS, INVOICE_STATUS } from "../../common/status-codes.js";
import type { FileStorage } from "../../infrastructure/storage/file-storage.js";
import type { InvoiceRepository } from "./invoice.repository.js";
import type { InvoiceFilter, InvoiceImportContext, ManualInvoiceFields, ParsedInvoice } from "./invoice.types.js";
import type { XmlInvoiceParser } from "./xml-invoice-parser.js";
import type { AccountingPeriodRepository } from "../accounting-period/accounting-period.types.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export class InvoiceService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly xmlParser: XmlInvoiceParser,
    private readonly storage: FileStorage,
    private readonly periodRepository?: Pick<AccountingPeriodRepository, "findByPostingDate">,
    private readonly prisma?: PrismaClient,
  ) {}

  async importXml(file: { originalName: string; data: Buffer }, context: InvoiceImportContext) {
    if (path.extname(file.originalName).toLowerCase() !== ".xml") {
      throw new AppError("UNSUPPORTED_INVOICE_FILE", "请选择 XML 电子发票文件", 400);
    }
    if (file.data.length === 0) throw new AppError("EMPTY_INVOICE_FILE", "上传文件为空", 400);
    const invoice = this.xmlParser.parse(file.data);
    const postingDate = context.postingDate ?? invoice.issueTime;
    const period = this.periodRepository ? await this.periodRepository.findByPostingDate(postingDate) : null;
    return this.persistImport(file, "XML", invoice, context, period);
  }

  async importDocument(file: { originalName: string; data: Buffer }, format: "OFD" | "PDF", fields: ManualInvoiceFields, context: InvoiceImportContext) {
    const extension = path.extname(file.originalName).toLowerCase().slice(1);
    if (extension !== format.toLowerCase()) throw new AppError("UNSUPPORTED_INVOICE_FILE", `请选择 ${format} 电子发票文件`, 400);
    if (file.data.length === 0) throw new AppError("EMPTY_INVOICE_FILE", "上传文件为空", 400);
    const invoice = this.manualInvoice(fields, format);
    const postingDate = context.postingDate ?? invoice.issueTime;
    const period = this.periodRepository ? await this.periodRepository.findByPostingDate(postingDate) : null;
    return this.persistImport(file, format, invoice, context, period);
  }

  private async persistImport(file: { originalName: string; data: Buffer }, format: "XML" | "OFD" | "PDF", invoice: ParsedInvoice, context: InvoiceImportContext, period: { id: number; periodCode: string; status: number } | null) {
    const hash = createHash("sha256").update(file.data).digest("hex");
    const storedFile = await this.storage.saveInvoiceImport(format.toLowerCase() as "xml" | "ofd" | "pdf", hash, file.data);
    try {
      const result = await this.repository.createImport(
        {
          format,
          originalName: path.basename(file.originalName),
          storagePath: storedFile.storagePath,
          fileHash: hash,
          invoice,
        },
        context,
      );
      return period?.status === ACCOUNTING_PERIOD_STATUS.CLOSED
        ? { ...result, periodWarning: { code: "ACCOUNTING_PERIOD_CLOSED" as const, message: "该发票属于已关账期间。", periodId: period.id, periodCode: period.periodCode } }
        : result;
    } catch (error) {
      if (storedFile.created) await this.storage.remove(storedFile.storagePath);
      throw error;
    }
  }

  async importXmlBatch(files: Array<{ originalName: string; data: Buffer }>, context: InvoiceImportContext) {
    const results: Array<Awaited<ReturnType<InvoiceService["importXml"]>> & { fileName: string }> = [];
    const errors: Array<{ fileName: string; code: string; message: string }> = [];
    for (const file of files) {
      try {
        results.push({ ...(await this.importXml(file, context)), fileName: file.originalName });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        errors.push({ fileName: file.originalName, code: error.code, message: error.message });
      }
    }
    return {
      totalCount: files.length,
      successCount: results.filter((result) => !result.duplicate).length,
      skippedCount: results.filter((result) => result.duplicate).length,
      failedCount: errors.length,
      results,
      errors,
    };
  }

  async list(filter: InvoiceFilter) {
    const result = await this.repository.list(filter);
    return {
      ...result,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.ceil(result.total / filter.pageSize),
    };
  }

  async getById(id: number) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
    return invoice;
  }

  async updateTaxDeduction(id: number, status: 1 | 2 | 3, amount: string, actorId: number) {
    if (![1, 2, 3].includes(status)) throw new AppError("INVALID_TAX_DEDUCTION_STATUS", "发票抵扣处理状态无效", 400);
    if (!/^\d{1,15}(?:\.\d{1,4})?$/.test(amount)) throw new AppError("INVALID_TAX_AMOUNT", "可抵扣税额格式无效", 400);
    const invoice = await this.getById(id) as { direction: string; status: number; totalTaxAmount: string };
    if (invoice.direction !== "PURCHASE") throw new AppError("TAX_DEDUCTION_PURCHASE_ONLY", "只有进项发票可以确认抵扣", 400);
    if (invoice.status !== INVOICE_STATUS.VERIFIED) throw new AppError("INVOICE_NOT_VERIFIED", "进项发票完成人工核验后才能确认抵扣", 409);
    const value = new Prisma.Decimal(amount); const total = new Prisma.Decimal(invoice.totalTaxAmount);
    if (value.greaterThan(total)) throw new AppError("TAX_DEDUCTION_EXCEEDED", "可抵扣税额不能超过发票税额", 400);
    if (status === 1 && !value.equals(total)) throw new AppError("TAX_DEDUCTION_AMOUNT_MISMATCH", "全额抵扣金额必须等于发票税额", 400);
    if (status === 2 && !value.equals(0)) throw new AppError("TAX_DEDUCTION_AMOUNT_MISMATCH", "不抵扣发票的可抵扣税额必须为零", 400);
    return this.repository.updateTaxDeduction(id, status, value.toString(), actorId);
  }
  async verify(id: number, actorId: number) { await this.getById(id); return this.repository.updateStatus(id, 1, actorId); }
  async void(id: number, actorId: number) { await this.getById(id); return this.repository.updateStatus(id, 2, actorId); }
  async linkVoucher(id: number, voucherId: number, actorId: number) { await this.repository.linkVoucher(id, voucherId, actorId); return this.getById(id); }
  async unlinkVoucher(id: number, voucherId: number, actorId: number) { await this.repository.unlinkVoucher(id, voucherId, actorId); return this.getById(id); }

  async linkRedLetter(id: number, redInvoiceId: number, actorId: number) {
    const prisma = this.database();
    if (id === redInvoiceId) throw new AppError("INVALID_RED_LETTER", "红字发票不能关联自身", 400);
    const linkedId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id IN (${id}, ${redInvoiceId}) AND deleted_at IS NULL FOR UPDATE`;
      const [original, red] = await Promise.all([
        tx.invoice.findFirst({ where: { id, deletedAt: null } }),
        tx.invoice.findFirst({ where: { id: redInvoiceId, deletedAt: null } }),
      ]);
      if (!original || !red) throw new AppError("INVOICE_NOT_FOUND", "未找到待关联的发票", 404);
      if (original.status === 2 || red.status === 2) throw new AppError("INVOICE_VOIDED", "作废发票不能建立红冲关联", 409);
      if (original.direction !== red.direction || original.currency !== red.currency) throw new AppError("INVALID_RED_LETTER", "红字发票必须与原发票方向及币种一致", 400);
      if (red.redInvoiceOfId || original.redInvoiceOfId) throw new AppError("INVALID_RED_LETTER", "红字发票与原发票的关联层级无效", 409);
      if (original.sellerIdNum !== red.sellerIdNum || original.buyerIdNum !== red.buyerIdNum) throw new AppError("INVALID_RED_LETTER_PARTY", "红字发票与原发票的购销双方必须一致", 400);
      if (!original.totalTaxIncludedAmount.greaterThan(0) || !red.totalTaxIncludedAmount.lessThan(0) || red.totalTaxIncludedAmount.abs().greaterThan(original.totalTaxIncludedAmount)) throw new AppError("INVALID_RED_LETTER_AMOUNT", "红字发票金额必须为负数且不能超过原发票金额", 400);
      const redComponentsExceeded = original.totalAmountWithoutTax.lessThanOrEqualTo(0)
        || original.totalTaxAmount.lessThan(0)
        || !red.totalAmountWithoutTax.lessThan(0)
        || red.totalTaxAmount.greaterThan(0)
        || red.totalAmountWithoutTax.abs().greaterThan(original.totalAmountWithoutTax)
        || red.totalTaxAmount.abs().greaterThan(original.totalTaxAmount);
      const existingRedTotals = await tx.invoice.aggregate({
        where: { redInvoiceOfId: id, deletedAt: null },
        _sum: { totalAmountWithoutTax: true, totalTaxAmount: true, totalTaxIncludedAmount: true },
      });
      const totalRedWithoutTax = (existingRedTotals._sum.totalAmountWithoutTax ?? new Prisma.Decimal(0)).minus(red.totalAmountWithoutTax).abs();
      const totalRedTax = (existingRedTotals._sum.totalTaxAmount ?? new Prisma.Decimal(0)).minus(red.totalTaxAmount).abs();
      const totalRedIncluded = (existingRedTotals._sum.totalTaxIncludedAmount ?? new Prisma.Decimal(0)).minus(red.totalTaxIncludedAmount).abs();
      if (redComponentsExceeded || totalRedWithoutTax.greaterThan(original.totalAmountWithoutTax) || totalRedTax.greaterThan(original.totalTaxAmount) || totalRedIncluded.greaterThan(original.totalTaxIncludedAmount)) {
        throw new AppError("INVALID_RED_LETTER_AMOUNT", "红字发票各组成金额累计不能超过原发票", 400);
      }
      await tx.invoice.update({ where: { id: redInvoiceId }, data: { redInvoiceOfId: id } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "Invoice", resourceId: redInvoiceId, description: "关联红字发票", afterData: { redInvoiceOfId: id } } });
      return redInvoiceId;
    });
    return this.getById(linkedId);
  }

  async listSalesRequests() {
    return this.database().salesInvoiceRequest.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async createSalesRequest(input: { buyerName: string; buyerIdNum: string; invoiceType: "SPECIAL" | "ORDINARY"; amountWithoutTax: string; taxAmount: string; items?: unknown; remark?: string }, actorId: number) {
    const prisma = this.database();
    const values = [input.amountWithoutTax, input.taxAmount];
    if (values.some((value) => !/^\d{1,15}(?:\.\d{1,4})?$/.test(value))) throw new AppError("INVALID_SALES_INVOICE_AMOUNT", "开票金额格式无效", 400);
    const buyerName = input.buyerName.trim(); const buyerIdNum = input.buyerIdNum.trim().toUpperCase();
    if (!buyerName || !buyerIdNum) throw new AppError("INVALID_SALES_INVOICE_BUYER", "请填写购方名称和税号", 400);
    const amountWithoutTax = new Prisma.Decimal(input.amountWithoutTax); const taxAmount = new Prisma.Decimal(input.taxAmount);
    const requestNo = `SI-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now().toString().slice(-6)}`;
    return prisma.$transaction(async (tx) => {
      const profile = await tx.companyProfile.findFirst({ where: { deletedAt: null }, select: { operationMode: true } });
      const simpleMode = (profile?.operationMode ?? "SIMPLE") === "SIMPLE";
      const row = await tx.salesInvoiceRequest.create({ data: { requestNo, buyerName, buyerIdNum, invoiceType: input.invoiceType, amountWithoutTax, taxAmount, amountIncludingTax: amountWithoutTax.plus(taxAmount), items: input.items === undefined ? Prisma.JsonNull : input.items as Prisma.InputJsonValue, remark: input.remark?.trim() || null, requestedById: actorId, status: simpleMode ? 1 : 0, approvedById: simpleMode ? actorId : null, approvedAt: simpleMode ? new Date() : null } });
      await tx.auditLog.create({ data: { actorId, action: "CREATE", resourceType: "SalesInvoiceRequest", resourceId: row.id, description: simpleMode ? "提交销项开票申请并自动通过" : "提交销项开票申请", afterData: { requestNo, buyerName, amount: row.amountIncludingTax.toString(), simpleMode } } });
      return row;
    });
  }

  async approveSalesRequest(id: number, actorId: number) { return this.changeSalesRequest(id, 0, 1, actorId); }
  async rejectSalesRequest(id: number, reason: string, actorId: number) { return this.changeSalesRequest(id, 0, 2, actorId, reason); }

  async issueSalesRequest(id: number, invoiceId: number, actorId: number) {
    const prisma = this.database();
    return prisma.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT id FROM sales_invoice_requests WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} AND deleted_at IS NULL FOR UPDATE`;
      }
      const request = await tx.salesInvoiceRequest.findFirst({ where: { id, deletedAt: null } });
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
      if (!request || !invoice) throw new AppError("SALES_INVOICE_REQUEST_NOT_FOUND", "未找到开票申请或已开具发票", 404);
      if (request.status !== 1) throw new AppError("SALES_INVOICE_REQUEST_NOT_APPROVED", "开票申请尚未审批通过", 409);
      if (invoice.direction !== "SALE") throw new AppError("INVOICE_NOT_SALES", "只能关联销项发票", 400);
      if (invoice.status !== INVOICE_STATUS.VERIFIED) throw new AppError("SALES_INVOICE_NOT_VERIFIED", "销项发票完成人工核验后才能登记开具", 409);
      if (invoice.buyerIdNum !== request.buyerIdNum || invoice.buyerName.trim() !== request.buyerName.trim()) throw new AppError("SALES_INVOICE_BUYER_MISMATCH", "销项发票购方与开票申请不一致", 409);
      if (invoice.invoiceType !== request.invoiceType) throw new AppError("SALES_INVOICE_TYPE_MISMATCH", "销项发票类型与开票申请不一致", 409);
      if (!invoice.totalAmountWithoutTax.equals(request.amountWithoutTax) || !invoice.totalTaxAmount.equals(request.taxAmount) || !invoice.totalTaxIncludedAmount.equals(request.amountIncludingTax)) throw new AppError("SALES_INVOICE_AMOUNT_MISMATCH", "销项发票金额与开票申请不一致", 409);
      const used = await tx.salesInvoiceRequest.findFirst({ where: { issuedInvoiceId: invoiceId, id: { not: id }, deletedAt: null }, select: { id: true } });
      if (used) throw new AppError("SALES_INVOICE_ALREADY_ISSUED", "该销项发票已用于其他开票申请", 409);

      // 业财一体联动：自动创建或关联客户，并生成对应的应收账款单据（Receivable）
      let receivableId: number | null = null;
      if ((tx as any).customer?.findFirst && (tx as any).receivable?.findFirst) {
        let customer = await (tx as any).customer.findFirst({
          where: {
            OR: [
              { taxId: request.buyerIdNum.trim() },
              { name: request.buyerName.trim() },
            ],
            deletedAt: null,
          },
        });
        if (!customer) {
          const customerCount = await (tx as any).customer.count();
          customer = await (tx as any).customer.create({
            data: {
              code: `CUST-${String(customerCount + 1).padStart(4, "0")}`,
              name: request.buyerName.trim(),
              taxId: request.buyerIdNum.trim(),
              creditLimit: new Prisma.Decimal(100000),
              enabled: true,
            },
          });
        }

        const existingReceivable = await (tx as any).receivable.findFirst({
          where: { documentNo: invoice.invoiceNumber, customerId: customer.id, deletedAt: null },
        });
        if (!existingReceivable) {
          const dueDays = 30;
          const dueDate = new Date(invoice.issueDate.getTime() + dueDays * 86_400_000);
          const rec = await (tx as any).receivable.create({
            data: {
              customerId: customer.id,
              documentNo: invoice.invoiceNumber,
              occurrenceDate: invoice.issueDate,
              dueDate,
              amount: invoice.totalTaxIncludedAmount,
              settledAmount: new Prisma.Decimal(0),
              currency: invoice.currency || "CNY",
              status: 0,
              description: `销项开票申请【${request.requestNo}】自动转应收账款`,
              createdById: actorId,
            },
          });
          receivableId = rec.id;
        } else {
          receivableId = existingReceivable.id;
        }
      }

      await tx.salesInvoiceRequest.update({ where: { id }, data: { status: 3, issuedInvoiceId: invoiceId } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "UPDATE",
          resourceType: "SalesInvoiceRequest",
          resourceId: id,
          description: "登记销项发票开具并生成应收单据",
          afterData: { invoiceId, receivableId },
        },
      });
      return tx.salesInvoiceRequest.findUniqueOrThrow({ where: { id } });
    });
  }

  private manualInvoice(fields: ManualInvoiceFields, format: "OFD" | "PDF"): ParsedInvoice {
    const required = [fields.invoiceNumber, fields.issueTime, fields.sellerName, fields.sellerIdNum, fields.buyerName, fields.buyerIdNum, fields.totalAmountWithoutTax, fields.totalTaxAmount, fields.totalTaxIncludedAmount];
    if (required.some((value) => !value?.trim())) throw new AppError("INVOICE_FIELDS_REQUIRED", `${format} 发票需要确认完整的结构化字段`, 400);
    const issueTime = new Date(fields.issueTime);
    if (Number.isNaN(issueTime.getTime())) throw new AppError("INVALID_INVOICE_ISSUE_TIME", "开票日期无效", 400);
    const amountFields = [fields.totalAmountWithoutTax, fields.totalTaxAmount, fields.totalTaxIncludedAmount];
    if (amountFields.some((value) => !/^-?\d{1,15}(?:\.\d{1,4})?$/.test(value))) throw new AppError("INVALID_INVOICE_AMOUNT", "发票金额格式无效", 400);
    const withoutTax = new Prisma.Decimal(fields.totalAmountWithoutTax); const tax = new Prisma.Decimal(fields.totalTaxAmount); const included = new Prisma.Decimal(fields.totalTaxIncludedAmount);
    if (!withoutTax.plus(tax).equals(included)) throw new AppError("INVOICE_TOTAL_MISMATCH", "不含税金额与税额之和必须等于价税合计", 400);
    return { invoiceType: fields.invoiceType ?? "UNKNOWN", invoiceNumber: fields.invoiceNumber.trim(), issueTime, sellerName: fields.sellerName.trim(), sellerIdNum: fields.sellerIdNum.trim().toUpperCase(), buyerName: fields.buyerName.trim(), buyerIdNum: fields.buyerIdNum.trim().toUpperCase(), totalAmountWithoutTax: withoutTax.toString(), totalTaxAmount: tax.toString(), totalTaxIncludedAmount: included.toString(), currency: fields.currency?.trim().toUpperCase() || "CNY", items: [], rawData: { importMode: "MANUAL_METADATA", format } };
  }

  private async changeSalesRequest(id: number, from: number, to: number, actorId: number, reason?: string) {
    const prisma = this.database();
    return prisma.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM sales_invoice_requests WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const row = await tx.salesInvoiceRequest.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new AppError("SALES_INVOICE_REQUEST_NOT_FOUND", "开票申请不存在", 404);
      if (row.status !== from) throw new AppError("INVALID_SALES_INVOICE_REQUEST_STATUS", "开票申请当前状态不允许此操作", 409);
      if (to === 2 && !reason?.trim()) throw new AppError("SALES_INVOICE_REJECT_REASON_REQUIRED", "请填写驳回原因", 400);
      const updated = await tx.salesInvoiceRequest.update({ where: { id }, data: { status: to, approvedById: to === 1 ? actorId : null, approvedAt: to === 1 ? new Date() : null, rejectReason: to === 2 ? reason!.trim() : null } });
      await tx.auditLog.create({ data: { actorId, action: to === 1 ? "REVIEW" : "UPDATE", resourceType: "SalesInvoiceRequest", resourceId: id, description: to === 1 ? "审批销项开票申请" : "驳回销项开票申请", afterData: { status: to, reason: reason ?? null } } });
      return updated;
    });
  }

  private database() { if (!this.prisma) throw new AppError("INVOICE_WORKFLOW_UNAVAILABLE", "当前运行环境未配置发票工作流数据库", 503); return this.prisma; }
}
