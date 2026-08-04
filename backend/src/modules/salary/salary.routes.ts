import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { SalaryController } from "./salary.controller.js";
import { EmployeeBody, EmployeeUpdateBody, IdParams, PeriodParams, SalaryGenerateBody, SalaryItemBody, SalaryItemUpdateBody } from "./dto/salary.dto.js";

async function auth(request: FastifyRequest) {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function viewer(request: FastifyRequest) {
  await auth(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅管理员或财务主管可以查看工资数据");
}

async function admin(request: FastifyRequest) {
  await auth(request);
  requireRole(request.user.role, ["ADMIN"], "仅系统管理员可以维护工资数据");
}

export async function salaryRoutes(app: FastifyInstance, options: { controller: SalaryController }) {
  const c = options.controller;
  app.get("/employees", { preHandler: viewer, handler: c.employees });
  app.post("/employees", { preHandler: admin, schema: { body: EmployeeBody }, handler: c.createEmployee });
  app.put("/employees/:id", { preHandler: admin, schema: { params: IdParams, body: EmployeeUpdateBody }, handler: c.updateEmployee });
  app.get("/items", { preHandler: viewer, handler: c.items });
  app.post("/items", { preHandler: admin, schema: { body: SalaryItemBody }, handler: c.createItem });
  app.put("/items/:id", { preHandler: admin, schema: { params: IdParams, body: SalaryItemUpdateBody }, handler: c.updateItem });
  app.delete("/items/:id", { preHandler: admin, schema: { params: IdParams }, handler: c.deleteItem });
  app.get("/:periodId/export", { preHandler: viewer, schema: { params: PeriodParams }, handler: c.export });
  app.post("/:periodId/import", { preHandler: admin, schema: { params: PeriodParams, consumes: ["multipart/form-data"] }, handler: c.import });
  app.get("/:periodId/summary", { preHandler: viewer, schema: { params: PeriodParams }, handler: c.summary });
  app.get("/:periodId", { preHandler: viewer, schema: { params: PeriodParams }, handler: c.salaries });
  app.post("/:periodId/generate", { preHandler: admin, schema: { params: PeriodParams, body: SalaryGenerateBody }, handler: c.generate });
  app.post("/records/:id/cancel", { preHandler: admin, schema: { params: IdParams, body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }) }, handler: c.cancel });
}
