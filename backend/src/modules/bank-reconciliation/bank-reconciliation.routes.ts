import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import { unauthorized } from "../../common/errors/app-error.js";
import type { BankReconciliationController } from "./bank-reconciliation.controller.js";
import { DirectionBody, IdParams, MatchBody, ReconciliationBody, ReconciliationQuery, ReconciliationUpdateBody } from "./dto/bank-reconciliation.dto.js";

const DirectionParams = Type.Object({ id: Type.Integer({ minimum: 1 }), transactionId: Type.Integer({ minimum: 1 }) });

async function auth(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
export async function bankReconciliationRoutes(app: FastifyInstance, options: { controller: BankReconciliationController }) {
  const c = options.controller; const secure = { preHandler: auth };
  app.get("/", { ...secure, schema: { tags: ["银行对账"], querystring: ReconciliationQuery }, handler: c.list });
  app.post("/", { ...secure, schema: { tags: ["银行对账"], body: ReconciliationBody }, handler: c.create });
  app.get("/:id", { ...secure, schema: { tags: ["银行对账"], params: IdParams }, handler: c.detail });
  app.put("/:id", { ...secure, schema: { tags: ["银行对账"], params: IdParams, body: ReconciliationUpdateBody }, handler: c.update });
  app.post("/:id/matches", { ...secure, schema: { tags: ["银行对账"], params: IdParams, body: MatchBody }, handler: c.match });
  app.put("/:id/transactions/:transactionId/direction", { ...secure, schema: { tags: ["银行对账"], params: DirectionParams, body: DirectionBody }, handler: c.confirmDirection });
  app.delete("/matches/:id", { ...secure, schema: { tags: ["银行对账"], params: IdParams }, handler: c.unmatch });
  app.post("/:id/auto-match", { ...secure, schema: { tags: ["银行对账"], params: IdParams }, handler: c.autoMatch });
  app.post("/:id/complete", { ...secure, schema: { tags: ["银行对账"], params: IdParams }, handler: c.complete });
  app.post("/:id/reopen", { ...secure, schema: { tags: ["银行对账"], params: IdParams }, handler: c.reopen });
}
