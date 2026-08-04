import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { AccountingPeriodService } from "./accounting-period.service.js";
import type { AccountingPeriodActor } from "./accounting-period.types.js";
import type { AccountingPeriodCreateBody, AccountingPeriodParams, AccountingPeriodQuery, AccountingPeriodUpdateBody } from "./dto/accounting-period.dto.js";

export class AccountingPeriodController {
  constructor(private readonly service: AccountingPeriodService) {}

  create = async (request: FastifyRequest<{ Body: AccountingPeriodCreateBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.create(request.body.year, request.body.month, this.actor(request)), "会计期间创建成功", 201);

  update = async (request: FastifyRequest<{ Params: AccountingPeriodParams; Body: AccountingPeriodUpdateBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.update(request.params.id, request.body, this.actor(request)), "会计期间修改成功");

  list = async (request: FastifyRequest<{ Querystring: AccountingPeriodQuery }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.list(request.query));

  close = async (request: FastifyRequest<{ Params: AccountingPeriodParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.close(request.params.id, this.actor(request)), "会计期间已关账");

  checklist = async (request: FastifyRequest<{ Params: AccountingPeriodParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.closeChecklist(request.params.id));

  reopen = async (request: FastifyRequest<{ Params: AccountingPeriodParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.reopen(request.params.id, this.actor(request)), "会计期间已反关账");

  private actor(request: FastifyRequest): AccountingPeriodActor {
    const userAgent = request.headers["user-agent"];
    return { actorId: Number(request.user.sub), role: request.user.role, requestId: request.id, ipAddress: request.ip, ...(userAgent ? { userAgent } : {}) };
  }
}
