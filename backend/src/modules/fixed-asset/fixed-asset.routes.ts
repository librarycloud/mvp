import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { FixedAssetController } from "./fixed-asset.controller.js";
async function auth(r: FastifyRequest) { await r.jwtVerify(); if (r.user.type !== "access") throw unauthorized("请使用访问令牌"); }
const id = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const body = Type.Object({ assetNo: Type.String({ minLength: 1 }), name: Type.String({ minLength: 1 }), category: Type.String({ minLength: 1 }), purchaseDate: Type.String({ format: "date" }), startUseDate: Type.String({ format: "date" }), originalValue: Type.String(), residualRate: Type.String(), depreciationMethod: Type.Union([Type.Literal("STRAIGHT_LINE"), Type.Literal("DOUBLE_DECLINING"), Type.Literal("SUM_OF_YEARS")]), usefulLifeMonths: Type.Integer({ minimum: 1 }), depreciationExpenseAccountId: Type.Optional(Type.Integer({ minimum: 1 })), department: Type.Optional(Type.String()), custodian: Type.Optional(Type.String()) });
const disposal = Type.Object({ disposalType: Type.Union([Type.Literal("DISCARD"), Type.Literal("SALE")]), disposalDate: Type.String({ format: "date" }), proceeds: Type.Optional(Type.String()), proceedsAccountId: Type.Optional(Type.Integer({ minimum: 1 })), gainLossAccountId: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Type.String({ maxLength: 500 })) });
export async function fixedAssetRoutes(app: FastifyInstance, o: { controller: FixedAssetController }) {
  const secure = { preHandler: auth };
  app.get("/", { ...secure, schema: { querystring: Type.Object({ status: Type.Optional(Type.String()), category: Type.Optional(Type.String()) }) }, handler: o.controller.list });
  app.post("/", { ...secure, schema: { body }, handler: o.controller.create });
  app.get("/:id", { ...secure, schema: { params: id }, handler: o.controller.get });
  app.get("/:id/disposals", { ...secure, schema: { params: id }, handler: o.controller.disposals });
  app.post("/:id/disposal", { ...secure, schema: { params: id, body: disposal }, handler: o.controller.dispose });
  app.put("/:id", { ...secure, schema: { params: id, body: Type.Partial(body) }, handler: o.controller.update });
  app.post("/:id/status", { ...secure, schema: { params: id, body: Type.Object({ status: Type.Integer({ minimum: 0, maximum: 3 }) }) }, handler: o.controller.status });
}
