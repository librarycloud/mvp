import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { DetailLedgerService } from "./detail-ledger.service.js";
import type { DetailLedgerQuery } from "./dto/detail-ledger.dto.js";

export class DetailLedgerController {
  constructor(private readonly service: DetailLedgerService) {}

  getLedger = async (
    request: FastifyRequest<{ Querystring: DetailLedgerQuery }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.getLedger({
        accountId: request.query.accountId,
        startDate: new Date(`${request.query.startDate}T00:00:00.000Z`),
        endDate: new Date(`${request.query.endDate}T23:59:59.999Z`),
        ...(request.query.auxiliaryKey ? { auxiliaryKey: request.query.auxiliaryKey } : {}),
        ...(request.query.auxiliaryValue ? { auxiliaryValue: request.query.auxiliaryValue } : {}),
      }),
    );
}
