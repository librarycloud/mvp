import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { DeferredExpenseService } from "./deferred-expense.service.js";
import type { CreateDeferredExpenseInput, DeferredExpenseFilter } from "./deferred-expense.types.js";

export class DeferredExpenseController {
  constructor(private readonly service: DeferredExpenseService) {}

  list = async (
    request: FastifyRequest<{ Querystring: DeferredExpenseFilter }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.list(request.query));

  create = async (
    request: FastifyRequest<{ Body: CreateDeferredExpenseInput }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.create(request.body, {
        actorId: Number(request.user.sub),
        role: request.user.role,
      }),
      "长期待摊费用登记成功",
      201,
    );

  amortize = async (
    request: FastifyRequest<{ Body: { periodId: number } }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.amortize(request.body.periodId, {
        actorId: Number(request.user.sub),
        role: request.user.role,
      }),
      "月度摊销凭证生成完成",
    );
}
