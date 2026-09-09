import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { AccountBalanceService } from "./account-balance.service.js";
import type { AccountBalanceQuery, AuxiliaryBalanceQueryDto } from "./dto/account-balance.dto.js";

export class AccountBalanceController {
  constructor(private readonly service: AccountBalanceService) {}

  getBalances = async (
    request: FastifyRequest<{ Querystring: AccountBalanceQuery }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.getBalances({
        startDate: new Date(`${request.query.startDate}T00:00:00.000Z`),
        endDate: new Date(`${request.query.endDate}T23:59:59.999Z`),
        includeZero: request.query.includeZero ?? true,
      }),
    );

  getAuxiliaryBalances = async (
    request: FastifyRequest<{ Querystring: AuxiliaryBalanceQueryDto }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.getAuxiliaryBalances({
        startDate: new Date(`${request.query.startDate}T00:00:00.000Z`),
        endDate: new Date(`${request.query.endDate}T23:59:59.999Z`),
        accountId: request.query.accountId,
        dimensionId: request.query.dimensionId,
        includeZero: request.query.includeZero ?? true,
      }),
    );
}
