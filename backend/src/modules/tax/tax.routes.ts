import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import { TaxPeriodQuerySchema } from "./dto/tax.dto.js";
import type { TaxController } from "./tax.controller.js";

const success = <T extends TSchema>(data: T) => Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });
const id = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const taxType = Type.Union([Type.Literal("VAT"), Type.Literal("SURCHARGE"), Type.Literal("CORPORATE_INCOME")]);
const declarationBody = Type.Object(
  { ...TaxPeriodQuerySchema.properties, taxType },
  { additionalProperties: false },
);
const adjustmentBody = Type.Object({ lines: Type.Array(Type.Object({ lineCode: Type.String({ minLength: 1, maxLength: 64 }), adjustmentAmount: Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,4})?$" }), remark: Type.Optional(Type.String({ maxLength: 500 })) }), { minItems: 1 }) });
const paymentBody = Type.Object({ amount: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }), paymentDate: Type.String({ format: "date" }), paymentReference: Type.Optional(Type.String({ maxLength: 100 })), bankTransactionId: Type.Optional(Type.Integer({ minimum: 1 })) });

async function authenticate(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
async function editor(request: FastifyRequest) { await authenticate(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"], "仅会计或财务主管可以生成和调整税务申报底稿"); }
async function manager(request: FastifyRequest) { await authenticate(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅财务主管可以复核或申报税务数据"); }
async function payer(request: FastifyRequest) { await authenticate(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "CASHIER"], "仅出纳或财务主管可以登记税款缴纳"); }

export async function taxRoutes(app: FastifyInstance, options: { controller: TaxController }) {
  for (const [path, handler, summary] of [["/input-ledger", options.controller.input, "进项税台账"], ["/output-ledger", options.controller.output, "销项税台账"], ["/foundation", options.controller.foundation, "纳税基础表"]] as const) {
    app.get(path, { preHandler: authenticate, schema: { tags: ["税务"], summary, security: [{ bearerAuth: [] }], querystring: TaxPeriodQuerySchema, response: { 200: success(Type.Any()) } }, handler });
  }
  app.get("/declarations", { preHandler: authenticate, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], querystring: Type.Partial(TaxPeriodQuerySchema) }, handler: options.controller.listDeclarations });
  app.post("/declarations", { preHandler: editor, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], body: declarationBody }, handler: options.controller.prepare });
  app.get("/declarations/:id", { preHandler: authenticate, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], params: id }, handler: options.controller.declaration });
  app.put("/declarations/:id/lines", { preHandler: editor, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], params: id, body: adjustmentBody }, handler: options.controller.updateLines });
  app.post("/declarations/:id/review", { preHandler: manager, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], params: id }, handler: options.controller.review });
  app.get("/declarations/:id/risks", { preHandler: authenticate, schema: { tags: ["税务申报"], summary: "金税四期申报前风险自检", security: [{ bearerAuth: [] }], params: id }, handler: options.controller.inspectRisks });
  app.post("/declarations/:id/declare", { preHandler: manager, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], params: id, body: Type.Object({ declarationNo: Type.Optional(Type.String({ maxLength: 100 })) }) }, handler: options.controller.declare });
  app.post("/declarations/:id/payments", { preHandler: payer, schema: { tags: ["税务申报"], security: [{ bearerAuth: [] }], params: id, body: paymentBody }, handler: options.controller.pay });
}
