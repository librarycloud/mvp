import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { ArApController } from "./ar-ap.controller.js";
import { AgingQuery, DocumentBody, DocumentQuery, FollowUpBody, FollowUpQuery, IdParams, KeywordQuery, PartyBody, PartyUpdateBody, SettlementBody, StatementOfAccountQuery } from "./dto/ar-ap.dto.js";
async function auth(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
async function editor(request: FastifyRequest) { await auth(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"], "仅会计或财务主管可以维护往来资料和单据"); }
async function payer(request: FastifyRequest) { await auth(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "CASHIER"], "仅出纳或财务主管可以登记收付款核销"); }
async function manager(request: FastifyRequest) { await auth(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅财务主管可以撤销往来核销"); }
export async function arApRoutes(app: FastifyInstance, options: { controller: ArApController }) {
  const c = options.controller; const secure = { preHandler: auth }; const editable = { preHandler: editor }; const payment = { preHandler: payer }; const manageable = { preHandler: manager };
  app.get("/customers", { ...secure, schema: { querystring: KeywordQuery }, handler: c.listCustomers }); app.post("/customers", { ...editable, schema: { body: PartyBody }, handler: c.createCustomer }); app.put("/customers/:id", { ...editable, schema: { params: IdParams, body: PartyUpdateBody }, handler: c.updateCustomer }); app.delete("/customers/:id", { ...editable, schema: { params: IdParams }, handler: c.deleteCustomer });
  app.get("/suppliers", { ...secure, schema: { querystring: KeywordQuery }, handler: c.listSuppliers }); app.post("/suppliers", { ...editable, schema: { body: PartyBody }, handler: c.createSupplier }); app.put("/suppliers/:id", { ...editable, schema: { params: IdParams, body: PartyUpdateBody }, handler: c.updateSupplier }); app.delete("/suppliers/:id", { ...editable, schema: { params: IdParams }, handler: c.deleteSupplier });
  app.get("/receivables/balances", { ...secure, handler: c.receivableBalances }); app.get("/payables/balances", { ...secure, handler: c.payableBalances }); app.get("/receivables/summary", { ...secure, handler: c.receivableSummary }); app.get("/payables/summary", { ...secure, handler: c.payableSummary }); app.get("/receivables/aging", { ...secure, schema: { querystring: AgingQuery }, handler: c.receivableAging }); app.get("/payables/aging", { ...secure, schema: { querystring: AgingQuery }, handler: c.payableAging });
  app.get("/receivables/aging-matrix", { ...secure, schema: { querystring: AgingQuery }, handler: c.receivableAgingMatrix });
  app.get("/payables/aging-matrix", { ...secure, schema: { querystring: AgingQuery }, handler: c.payableAgingMatrix });
  app.get("/statement-of-account", { ...secure, schema: { querystring: StatementOfAccountQuery }, handler: c.statementOfAccount });
  app.get("/receivables", { ...secure, schema: { querystring: DocumentQuery }, handler: c.listReceivables }); app.post("/receivables", { ...editable, schema: { body: DocumentBody }, handler: c.createReceivable }); app.get("/receivables/:id/bank-matches", { ...secure, schema: { params: IdParams }, handler: c.receivableMatches }); app.post("/receivables/:id/receipts", { ...payment, schema: { params: IdParams, body: SettlementBody }, handler: c.receipt }); app.post("/receivables/:id/write-offs", { ...payment, schema: { params: IdParams, body: SettlementBody }, handler: c.receivableWriteOff });
  app.post("/receivable-settlements/:id/cancel", { ...manageable, schema: { params: IdParams, body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }) }, handler: c.cancelReceipt });
  app.get("/payables", { ...secure, schema: { querystring: DocumentQuery }, handler: c.listPayables }); app.post("/payables", { ...editable, schema: { body: DocumentBody }, handler: c.createPayable }); app.get("/payables/:id/bank-matches", { ...secure, schema: { params: IdParams }, handler: c.payableMatches }); app.post("/payables/:id/payments", { ...payment, schema: { params: IdParams, body: SettlementBody }, handler: c.payment }); app.post("/payables/:id/write-offs", { ...payment, schema: { params: IdParams, body: SettlementBody }, handler: c.payableWriteOff });
  app.post("/payable-settlements/:id/cancel", { ...manageable, schema: { params: IdParams, body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }) }, handler: c.cancelPayment });
  app.get("/follow-ups", { ...secure, schema: { querystring: FollowUpQuery }, handler: c.followUps });
  app.post("/follow-ups", { ...secure, schema: { body: FollowUpBody }, handler: c.createFollowUp });
  app.post("/follow-ups/:id/complete", { ...secure, schema: { params: IdParams, body: Type.Object({ result: Type.String({ maxLength: 500 }) }) }, handler: c.completeFollowUp });
}
