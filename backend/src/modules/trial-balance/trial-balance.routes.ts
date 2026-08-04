import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { TrialBalanceController } from "./trial-balance.controller.js";
import { TrialBalanceQuerySchema, TrialBalanceSchema } from "./dto/trial-balance.dto.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function trialBalanceRoutes(
  app: FastifyInstance,
  options: { controller: TrialBalanceController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["账簿"], summary: "查询试算平衡表",
      description: "仅聚合已审核凭证的直接过账科目，不重复汇总上级科目。",
      security: [{ bearerAuth: [] }], querystring: TrialBalanceQuerySchema,
      response: { 200: Type.Object({ success: Type.Literal(true), data: TrialBalanceSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.getTrialBalance,
  });
}
