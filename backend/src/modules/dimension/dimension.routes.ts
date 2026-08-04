import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { DimensionController } from "./dimension.controller.js";
import { DimensionBody, DimensionUpdateBody, IdParams, MemberBody, MemberUpdateBody, RuleBody } from "./dto/dimension.dto.js";

async function auth(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
async function manager(request: FastifyRequest) { await auth(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅管理员或财务主管可以维护辅助核算"); }

export async function dimensionRoutes(app: FastifyInstance, options: { controller: DimensionController }) {
  const c = options.controller;
  app.get("/", { preHandler: auth, handler: c.list });
  app.post("/", { preHandler: manager, schema: { body: DimensionBody }, handler: c.create });
  app.put("/:id", { preHandler: manager, schema: { params: IdParams, body: DimensionUpdateBody }, handler: c.update });
  app.post("/:id/members", { preHandler: manager, schema: { params: IdParams, body: MemberBody }, handler: c.createMember });
  app.put("/members/:id", { preHandler: manager, schema: { params: IdParams, body: MemberUpdateBody }, handler: c.updateMember });
  app.delete("/members/:id", { preHandler: manager, schema: { params: IdParams }, handler: c.deleteMember });
  app.post("/rules", { preHandler: manager, schema: { body: RuleBody }, handler: c.upsertRule });
  app.delete("/rules/:id", { preHandler: manager, schema: { params: IdParams }, handler: c.deleteRule });
}
