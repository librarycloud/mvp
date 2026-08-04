import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { TrialBalanceService } from "./trial-balance.service.js";
import type { TrialBalanceQuery } from "./dto/trial-balance.dto.js";

export class TrialBalanceController {
  constructor(private readonly service: TrialBalanceService) {}

  getTrialBalance = async (
    request: FastifyRequest<{ Querystring: TrialBalanceQuery }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.getTrialBalance({
        startDate: new Date(`${request.query.startDate}T00:00:00.000Z`),
        endDate: new Date(`${request.query.endDate}T23:59:59.999Z`),
        includeZero: request.query.includeZero ?? false,
      }),
    );
}
