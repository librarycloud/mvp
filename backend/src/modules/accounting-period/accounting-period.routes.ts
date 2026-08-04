import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AccountingPeriodController } from "./accounting-period.controller.js";
import { AccountingPeriodCreateBodySchema, AccountingPeriodParamsSchema, AccountingPeriodQuerySchema, AccountingPeriodSchema, AccountingPeriodUpdateBodySchema } from "./dto/accounting-period.dto.js";

const success = <T extends TSchema>(data: T) => Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });
async function authenticate(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }

export async function accountingPeriodRoutes(app: FastifyInstance, options: { controller: AccountingPeriodController }) {
  app.get("/", { preHandler: authenticate, schema: { tags: ["会计期间"], querystring: AccountingPeriodQuerySchema, security: [{ bearerAuth: [] }], response: { 200: success(Type.Array(AccountingPeriodSchema)) } }, handler: options.controller.list });
  app.post("/", { preHandler: authenticate, schema: { tags: ["会计期间"], body: AccountingPeriodCreateBodySchema, security: [{ bearerAuth: [] }], response: { 201: success(AccountingPeriodSchema) } }, handler: options.controller.create });
  app.put("/:id", { preHandler: authenticate, schema: { tags: ["会计期间"], params: AccountingPeriodParamsSchema, body: AccountingPeriodUpdateBodySchema, security: [{ bearerAuth: [] }], response: { 200: success(AccountingPeriodSchema) } }, handler: options.controller.update });
  app.post("/:id/close", { preHandler: authenticate, schema: { tags: ["会计期间"], params: AccountingPeriodParamsSchema, security: [{ bearerAuth: [] }], response: { 200: success(AccountingPeriodSchema) } }, handler: options.controller.close });
  app.get("/:id/close-checklist", { preHandler: authenticate, schema: { tags: ["会计期间"], params: AccountingPeriodParamsSchema, security: [{ bearerAuth: [] }] }, handler: options.controller.checklist });
  app.post("/:id/reopen", { preHandler: authenticate, schema: { tags: ["会计期间"], params: AccountingPeriodParamsSchema, security: [{ bearerAuth: [] }], response: { 200: success(AccountingPeriodSchema) } }, handler: options.controller.reopen });
}
