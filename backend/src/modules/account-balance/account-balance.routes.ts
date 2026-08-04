import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AccountBalanceController } from "./account-balance.controller.js";
import { AccountBalanceQuerySchema, AccountBalanceSchema } from "./dto/account-balance.dto.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function accountBalanceRoutes(
  app: FastifyInstance,
  options: { controller: AccountBalanceController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["账簿"], summary: "查询科目余额表",
      description: "仅从已审核凭证分录实时聚合，不提供余额写入接口。",
      security: [{ bearerAuth: [] }], querystring: AccountBalanceQuerySchema,
      response: { 200: Type.Object({ success: Type.Literal(true), data: AccountBalanceSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.getBalances,
  });
}
