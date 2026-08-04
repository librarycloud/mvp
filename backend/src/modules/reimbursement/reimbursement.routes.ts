import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type } from "@sinclair/typebox";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { ReimbursementController } from "./reimbursement.controller.js";
import { AvailableInvoiceQuery, IdParams, PaymentBody, ReimbursementBody, ReimbursementQuery, ReimbursementUpdateBody, RejectBody } from "./dto/reimbursement.dto.js";

async function authenticate(request: FastifyRequest) {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function requireManager(request: FastifyRequest) {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅财务主管可以审批报销单");
}

async function requirePayer(request: FastifyRequest) {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "CASHIER"], "仅出纳或财务主管可以付款报销单");
}

export async function reimbursementRoutes(app: FastifyInstance, options: { controller: ReimbursementController }) {
  const c = options.controller;
  const secure = { preHandler: authenticate };
  const manager = { preHandler: requireManager };
  const payer = { preHandler: requirePayer };
  app.get("/", { ...secure, schema: { querystring: ReimbursementQuery }, handler: c.list });
  app.get("/summary", { ...secure, handler: c.summary });
  app.get("/available-invoices", { ...secure, schema: { querystring: AvailableInvoiceQuery }, handler: c.availableInvoices });
  app.get("/:id/available-bank-transactions", { ...secure, schema: { params: IdParams }, handler: c.availableBankTransactions });
  app.get("/:id", { ...secure, schema: { params: IdParams }, handler: c.get });
  app.post("/", { ...secure, schema: { body: ReimbursementBody }, handler: c.create });
  app.put("/:id", { ...secure, schema: { params: IdParams, body: ReimbursementUpdateBody }, handler: c.update });
  app.delete("/:id", { ...secure, schema: { params: IdParams }, handler: c.remove });
  app.post("/:id/submit", { ...secure, schema: { params: IdParams }, handler: c.submit });
  app.post("/:id/approve", { ...manager, schema: { params: IdParams }, handler: c.approve });
  app.post("/:id/reject", { ...manager, schema: { params: IdParams, body: RejectBody }, handler: c.reject });
  app.post("/:id/pay", { ...payer, schema: { params: IdParams, body: PaymentBody }, handler: c.pay });
  app.post("/:id/cancel-payment", { ...payer, schema: { params: IdParams, body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }) }, handler: c.cancelPayment });
}
