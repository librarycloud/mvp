import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { UserController } from "./user.controller.js";

async function requireAdmin(request: FastifyRequest) {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
  requireRole(request.user.role, ["ADMIN"], "仅系统管理员可以管理用户和会话设置");
}

const roles = Type.Union([Type.Literal("ADMIN"), Type.Literal("FINANCE_MANAGER"), Type.Literal("ACCOUNTANT"), Type.Literal("CASHIER")]);
const userBody = Type.Object({ username: Type.String({ minLength: 1, maxLength: 64 }), displayName: Type.String({ minLength: 1, maxLength: 100 }), password: Type.String({ minLength: 8, maxLength: 128 }), role: roles });
const updateBody = Type.Object({ displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })), password: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })), role: Type.Optional(roles), status: Type.Optional(Type.Integer({ minimum: 0, maximum: 1 })) }, { minProperties: 1 });

export async function userRoutes(app: FastifyInstance, options: { controller: UserController }) {
  const secure = { preHandler: requireAdmin };
  app.get("/", { ...secure, handler: options.controller.list });
  app.post("/", { ...secure, schema: { body: userBody }, handler: options.controller.create });
  app.put("/:id", { ...secure, schema: { params: Type.Object({ id: Type.Integer({ minimum: 1 }) }), body: updateBody }, handler: options.controller.update });
  app.get("/session-settings", { ...secure, handler: options.controller.getSessionSettings });
  app.put("/session-settings", { ...secure, schema: { body: Type.Object({ idleTimeoutMinutes: Type.Integer({ minimum: 5, maximum: 480 }) }) }, handler: options.controller.setSessionSettings });
}
