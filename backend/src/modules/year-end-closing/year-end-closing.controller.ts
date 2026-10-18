import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { YearEndClosingService } from "./year-end-closing.service.js";
import type { YearEndInput } from "./year-end-closing.types.js";

export class YearEndClosingController {
  constructor(private readonly service: YearEndClosingService) {}

  preview = async (request: FastifyRequest<{ Params: { year: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.preview(Number(request.params.year), { actorId: Number(request.user.sub), role: request.user.role }));

  get = async (request: FastifyRequest<{ Params: { year: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.get(Number(request.params.year)));

  close = async (request: FastifyRequest<{ Params: { year: string }; Body: YearEndInput }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.close(Number(request.params.year), request.body, { actorId: Number(request.user.sub), role: request.user.role }), "年度结转完成", 201);

  cancel = async (request: FastifyRequest<{ Params: { year: string }; Body: { reason: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.cancel(Number(request.params.year), request.body.reason, { actorId: Number(request.user.sub), role: request.user.role }), "年度结转已撤销");

  closeMonthlyPnl = async (request: FastifyRequest<{ Body: { periodId: number; profitAccountId?: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.closeMonthlyPnl(request.body.periodId, request.body.profitAccountId, { actorId: Number(request.user.sub), role: request.user.role }), "月度损益结转完成", 201);

  cancelMonthlyPnl = async (request: FastifyRequest<{ Body: { periodId: number; reason?: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.cancelMonthlyPnl(request.body.periodId, request.body.reason ?? "手动撤销月度损益结转", { actorId: Number(request.user.sub), role: request.user.role }), "月度损益结转已撤销");

  getMonthlyPnlStatus = async (request: FastifyRequest<{ Params: { periodId: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.getMonthlyPnlStatus(Number(request.params.periodId)));
}
