import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { DetailLedgerController } from "./detail-ledger.controller.js";
import { DetailLedgerQuerySchema, DetailLedgerSchema } from "./dto/detail-ledger.dto.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function detailLedgerRoutes(
  app: FastifyInstance,
  options: { controller: DetailLedgerController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["账簿"],
      summary: "查询明细账",
      description: "仅从已审核凭证分录派生，可按辅助核算键和值筛选。",
      security: [{ bearerAuth: [] },],
      querystring: DetailLedgerQuerySchema,
      response: {
        200: Type.Object({ success: Type.Literal(true), data: DetailLedgerSchema, message: Type.String(), requestId: Type.String() }),
      },
    },
    handler: options.controller.getLedger,
  });
}
