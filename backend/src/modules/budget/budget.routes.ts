import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { BudgetController } from "./budget.controller.js";
import { IdParams, LineBody, LineUpdateBody, PlanBody, PlanQuery, PlanUpdateBody } from "./dto/budget.dto.js";

async function auth(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
async function manager(request: FastifyRequest) { await auth(request); requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅管理员或财务主管可以维护预算"); }
export async function budgetRoutes(app: FastifyInstance, options: { controller: BudgetController }) {
  const c = options.controller;
  app.get("/", { preHandler: auth, schema: { querystring: PlanQuery }, handler: c.list });
  app.post("/", { preHandler: manager, schema: { body: PlanBody }, handler: c.createPlan });
  app.put("/:id", { preHandler: manager, schema: { params: IdParams, body: PlanUpdateBody }, handler: c.updatePlan });
  app.post("/:id/lines", { preHandler: manager, schema: { params: IdParams, body: LineBody }, handler: c.addLine });
  app.put("/lines/:id", { preHandler: manager, schema: { params: IdParams, body: LineUpdateBody }, handler: c.updateLine });
  app.delete("/lines/:id", { preHandler: manager, schema: { params: IdParams }, handler: c.deleteLine });
}
