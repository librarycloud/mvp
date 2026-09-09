import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { InvoiceService } from "./invoice.service.js";
import type { InvoiceFilter, InvoiceImportContext, ManualInvoiceFields } from "./invoice.types.js";
import type { InvoiceImportQuery, InvoiceParams, InvoiceQuery } from "./dto/invoice.dto.js";

export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  importXml = async (request: FastifyRequest<{ Querystring: InvoiceImportQuery }>, reply: FastifyReply) => {
    const files: Array<{ originalName: string; data: Buffer }> = [];
    for await (const upload of request.files({ limits: { fileSize: 10 * 1024 * 1024, files: 10 } })) {
      files.push({ originalName: upload.filename, data: await upload.toBuffer() });
    }
    if (files.length === 0) throw new AppError("INVOICE_FILE_REQUIRED", "请选择 XML 电子发票文件", 400);
    const context = this.context(request);
    if (request.query.postingDate) {
      const postingDate = new Date(`${request.query.postingDate}T00:00:00.000Z`);
      if (Number.isNaN(postingDate.getTime())) throw new AppError("INVALID_DATE", "入账日期无效", 400);
      context.postingDate = postingDate;
    }
    const result = await this.service.importXmlBatch(files, context);
    return sendSuccess(reply, result, `电子发票导入完成：成功 ${result.successCount}，跳过 ${result.skippedCount}，失败 ${result.failedCount}`, 201);
  };

  importDocument = async (request: FastifyRequest<{ Querystring: InvoiceImportQuery }>, reply: FastifyReply) => {
    let file: { originalName: string; data: Buffer } | undefined;
    const fields: Record<string, string> = {};
    for await (const part of request.parts({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } })) {
      if (part.type === "file") file = { originalName: part.filename, data: await part.toBuffer() };
      else fields[part.fieldname] = String(part.value);
    }
    if (!file) throw new AppError("INVOICE_FILE_REQUIRED", "请选择 OFD 或 PDF 电子发票文件", 400);
    const extension = file.originalName.split(".").pop()?.toUpperCase();
    if (extension !== "OFD" && extension !== "PDF") throw new AppError("UNSUPPORTED_INVOICE_FILE", "仅支持 OFD 或 PDF 电子发票原件", 400);
    const context = this.context(request);
    if (request.query.postingDate) context.postingDate = new Date(`${request.query.postingDate}T00:00:00.000Z`);
    const result = await this.service.importDocument(file, extension, fields as unknown as ManualInvoiceFields, context);
    return sendSuccess(reply, result, `${extension} 电子发票已归档并录入`, 201);
  };

  list = async (request: FastifyRequest<{ Querystring: InvoiceQuery }>, reply: FastifyReply) => {
    const filter: InvoiceFilter = {
      page: request.query.page ?? 1,
      pageSize: request.query.pageSize ?? 20,
    };
    if (request.query.keyword !== undefined) filter.keyword = request.query.keyword;
    if (request.query.direction !== undefined) filter.direction = request.query.direction;
    if (request.query.startTime !== undefined) filter.startTime = new Date(request.query.startTime);
    if (request.query.endTime !== undefined) filter.endTime = new Date(request.query.endTime);
    if (filter.startTime && filter.endTime && filter.startTime > filter.endTime) {
      throw new AppError("INVALID_DATE_RANGE", "开始时间不能晚于结束时间", 400);
    }
    return sendSuccess(reply, await this.service.list(filter));
  };

  getById = async (request: FastifyRequest<{ Params: InvoiceParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.getById(request.params.id));
  updateTaxDeduction = async (request: FastifyRequest<{ Params: InvoiceParams; Body: { status: 1 | 2 | 3; deductibleTaxAmount: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.updateTaxDeduction(request.params.id, request.body.status, request.body.deductibleTaxAmount, Number(request.user.sub)), "发票抵扣处理已保存");
  verify = async (request: FastifyRequest<{ Params: InvoiceParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.verify(request.params.id, Number(request.user.sub)), "发票已核验");
  void = async (request: FastifyRequest<{ Params: InvoiceParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.void(request.params.id, Number(request.user.sub)), "发票已作废");
  linkRedLetter = async (request: FastifyRequest<{ Params: InvoiceParams; Body: { redInvoiceId: number } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.linkRedLetter(request.params.id, request.body.redInvoiceId, Number(request.user.sub)), "红字发票已关联");
  linkVoucher = async (request: FastifyRequest<{ Params: InvoiceParams; Body: { voucherId: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.linkVoucher(request.params.id, request.body.voucherId, Number(request.user.sub)), "凭证关联成功");
  unlinkVoucher = async (request: FastifyRequest<{ Params: { id: number; voucherId: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.unlinkVoucher(request.params.id, request.params.voucherId, Number(request.user.sub)), "凭证关联已解除");
  generateVoucher = async (
    request: FastifyRequest<{
      Params: InvoiceParams;
      Body: { expenseOrRevenueAccountId?: number; settlementAccountId?: number; summary?: string };
    }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.generateVoucher(
        request.params.id,
        request.body ?? {},
        { actorId: Number(request.user.sub), role: request.user.role },
      ),
      "记账凭证已自动生成",
      201,
    );
  listSalesRequests = async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, await this.service.listSalesRequests());
  createSalesRequest = async (request: FastifyRequest<{ Body: { buyerName: string; buyerIdNum: string; invoiceType: "SPECIAL" | "ORDINARY"; amountWithoutTax: string; taxAmount: string; items?: unknown; remark?: string } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.createSalesRequest(request.body, Number(request.user.sub)), "销项开票申请已提交", 201);
  approveSalesRequest = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.approveSalesRequest(request.params.id, Number(request.user.sub)), "销项开票申请已审批");
  rejectSalesRequest = async (request: FastifyRequest<{ Params: { id: number }; Body: { reason: string } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.rejectSalesRequest(request.params.id, request.body.reason, Number(request.user.sub)), "销项开票申请已驳回");
  issueSalesRequest = async (request: FastifyRequest<{ Params: { id: number }; Body: { invoiceId: number } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.issueSalesRequest(request.params.id, request.body.invoiceId, Number(request.user.sub)), "已登记销项发票开具");

  private context(request: FastifyRequest): InvoiceImportContext {
    const context: InvoiceImportContext = {
      actorId: Number(request.user.sub),
      requestId: request.id,
      ipAddress: request.ip,
    };
    const userAgent = request.headers["user-agent"];
    if (userAgent) context.userAgent = userAgent;
    return context;
  }
}
