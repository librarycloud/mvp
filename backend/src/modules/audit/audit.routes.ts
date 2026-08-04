import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AuditController } from "./audit.controller.js";

async function admin(request: FastifyRequest) {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
  requireRole(request.user.role, ["ADMIN"], "仅系统管理员可以查看审计日志");
}

const query = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000, default: 50 })),
  actorId: Type.Optional(Type.Integer({ minimum: 1 })),
  action: Type.Optional(Type.String({ maxLength: 32 })),
  resourceType: Type.Optional(Type.String({ maxLength: 100 })),
  requestId: Type.Optional(Type.String({ maxLength: 100 })),
  startAt: Type.Optional(Type.String({ format: "date-time" })),
  endAt: Type.Optional(Type.String({ format: "date-time" })),
}, { additionalProperties: false });

export async function auditRoutes(app: FastifyInstance, options: { controller: AuditController }) {
  app.get("/", { preHandler: admin, schema: { tags: ["审计中心"], security: [{ bearerAuth: [] }], querystring: query }, handler: options.controller.list });
  app.get("/export.csv", { preHandler: admin, schema: { tags: ["审计中心"], security: [{ bearerAuth: [] }], querystring: query }, handler: options.controller.exportCsv });
}
