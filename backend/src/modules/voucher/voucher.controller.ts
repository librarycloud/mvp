import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { VoucherService } from "./voucher.service.js";
import type { VoucherImportService } from "./voucher-import.service.js";
import type { VoucherActor, VoucherFilter } from "./voucher.types.js";
import type {
  VoucherAttachmentParams,
  VoucherBatchBody,
  VoucherParams,
  VoucherQuery,
  VoucherSuggestionParams,
  VoucherWriteBody,
} from "./dto/voucher.dto.js";

export class VoucherController {
  constructor(
    private readonly service: VoucherService,
    private readonly importService?: VoucherImportService,
  ) {}

  downloadImportTemplate = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!this.importService) throw new AppError("SERVICE_UNAVAILABLE", "凭证导入服务不可用", 503);
    const buffer = await this.importService.generateTemplate();
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("content-disposition", 'attachment; filename="voucher-import-template.xlsx"');
    return reply.send(buffer);
  };

  importVouchers = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.importService) throw new AppError("SERVICE_UNAVAILABLE", "凭证导入服务不可用", 503);
    const upload = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
    if (!upload) throw new AppError("FILE_REQUIRED", "请上传凭证导入文件", 400);
    const ext = upload.filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
    const buffer = await upload.toBuffer();
    const result = await this.importService.importVouchers(buffer, ext, this.actor(request));
    return sendSuccess(reply, result, `成功批量导入 ${result.totalImported} 张凭证`, 201);
  };

  create = async (request: FastifyRequest<{ Body: VoucherWriteBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.createManual(this.writeInput(request.body), this.actor(request)), "凭证创建成功", 201);

  createFromAi = async (
    request: FastifyRequest<{ Params: VoucherSuggestionParams; Body: VoucherWriteBody }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.createFromSuggestion(
        request.params.suggestionId,
        this.writeInput(request.body),
        this.actor(request),
      ),
      "AI 建议已确认并生成凭证",
      201,
    );

  update = async (
    request: FastifyRequest<{ Params: VoucherParams; Body: VoucherWriteBody }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.update(request.params.id, this.writeInput(request.body), this.actor(request)), "凭证修改成功");

  remove = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) => {
    await this.service.remove(request.params.id, this.actor(request));
    return sendSuccess(reply, null, "凭证删除成功");
  };

  review = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.review(request.params.id, this.actor(request)), "凭证审核成功");

  submit = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.submit(request.params.id, this.actor(request)), "凭证已提交审核");

  unreview = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.unreview(request.params.id, this.actor(request)), "凭证反审核成功");

  post = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.post(request.params.id, this.actor(request)), "凭证记账成功");

  unpost = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.unpost(request.params.id, this.actor(request)), "凭证已取消记账");

  voidVoucher = async (request: FastifyRequest<{ Params: VoucherParams; Body: { reason: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.void(request.params.id, request.body.reason, this.actor(request)), "凭证已作废");

  restore = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.restore(request.params.id, this.actor(request)), "凭证已恢复为草稿");

  batchSubmit = async (request: FastifyRequest<{ Body: VoucherBatchBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.batch("submit", request.body.ids, this.actor(request)), "批量提交完成");

  batchReview = async (request: FastifyRequest<{ Body: VoucherBatchBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.batch("review", request.body.ids, this.actor(request)), "批量审核完成");

  batchPost = async (request: FastifyRequest<{ Body: VoucherBatchBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.batch("post", request.body.ids, this.actor(request)), "批量记账完成");

  list = async (request: FastifyRequest<{ Querystring: VoucherQuery }>, reply: FastifyReply) => {
    const filter: VoucherFilter = {
      page: request.query.page ?? 1,
      pageSize: request.query.pageSize ?? 20,
    };
    if (request.query.status !== undefined) filter.status = request.query.status;
    if (request.query.category !== undefined) filter.category = request.query.category;
    if (request.query.keyword !== undefined) filter.keyword = request.query.keyword;
    if (request.query.fiscalYear !== undefined) filter.fiscalYear = request.query.fiscalYear;
    if (request.query.fiscalPeriod !== undefined) filter.fiscalPeriod = request.query.fiscalPeriod;
    if (request.query.periodId !== undefined) filter.periodId = request.query.periodId;
    if (request.query.startDate !== undefined) filter.startDate = this.date(request.query.startDate);
    if (request.query.endDate !== undefined) filter.endDate = this.date(request.query.endDate);
    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
      throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);
    }
    return sendSuccess(reply, await this.service.list(filter));
  };

  getById = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.getById(request.params.id));

  reorder = async (
    request: FastifyRequest<{ Body: { fiscalYear: number; fiscalPeriod?: number } }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.reorder(request.body.fiscalYear, request.body.fiscalPeriod, this.actor(request)),
      "凭证序号重排完成",
    );

  cashierSign = async (request: FastifyRequest<{ Params: VoucherParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.cashierSign(request.params.id, this.actor(request)), "出纳签字成功");

  cashierJournal = async (
    request: FastifyRequest<{ Querystring: { accountCode?: string; startDate: string; endDate: string } }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.cashierJournal({
        ...(request.query.accountCode ? { accountCode: request.query.accountCode } : {}),
        startDate: this.date(request.query.startDate),
        endDate: new Date(`${request.query.endDate}T23:59:59.999Z`),
      }),
    );

  addAttachment = async (
    request: FastifyRequest<{ Params: VoucherAttachmentParams }>,
    reply: FastifyReply,
  ) => {
    const upload = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
    if (!upload) throw new AppError("ATTACHMENT_REQUIRED", "请选择附件", 400);
    const result = await this.service.addAttachment(
      request.params.id,
      { originalName: upload.filename, mimeType: upload.mimetype, data: await upload.toBuffer() },
      this.actor(request),
    );
    return sendSuccess(reply, result, "附件上传成功", 201);
  };

  private writeInput(body: VoucherWriteBody) {
    const voucherDate = this.date(body.voucherDate);
    return {
      voucherDate,
      postingDate: body.postingDate ? this.date(body.postingDate) : voucherDate,
      summary: body.summary,
      ...(body.category ? { category: body.category } : {}),
      entries: body.entries,
    };
  }

  private date(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private actor(request: FastifyRequest): VoucherActor {
    const actor: VoucherActor = {
      actorId: Number(request.user.sub),
      role: request.user.role,
      requestId: request.id,
      ipAddress: request.ip,
    };
    const userAgent = request.headers["user-agent"];
    if (userAgent) actor.userAgent = userAgent;
    return actor;
  }
}
