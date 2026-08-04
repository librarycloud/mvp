import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { GeneralLedgerController } from "./general-ledger.controller.js";
import { GeneralLedgerQuerySchema, GeneralLedgerSchema } from "./dto/general-ledger.dto.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function generalLedgerRoutes(
  app: FastifyInstance,
  options: { controller: GeneralLedgerController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["账簿"],
      summary: "查询总账",
      description: "仅从已审核凭证分录派生，不提供账簿写入接口。",
      security: [{ bearerAuth: [] }],
      querystring: GeneralLedgerQuerySchema,
      response: {
        200: Type.Object({
          success: Type.Literal(true),
          data: GeneralLedgerSchema,
          message: Type.String(),
          requestId: Type.String(),
        }),
      },
    },
    handler: options.controller.getLedger,
  });
}
