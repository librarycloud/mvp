import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { GeneralLedgerService } from "./general-ledger.service.js";
import type { GeneralLedgerQuery } from "./dto/general-ledger.dto.js";

export class GeneralLedgerController {
  constructor(private readonly service: GeneralLedgerService) {}

  getLedger = async (
    request: FastifyRequest<{ Querystring: GeneralLedgerQuery }>,
    reply: FastifyReply,
  ) => {
    const startDate = new Date(`${request.query.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${request.query.endDate}T23:59:59.999Z`);
    return sendSuccess(
      reply,
      await this.service.getLedger({ accountId: request.query.accountId, startDate, endDate }),
    );
  };
}
