import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AuthController } from "./auth.controller.js";
import {
  AuthResultSchema,
  AuthUserSchema,
  LoginBodySchema,
  RefreshBodySchema,
} from "./dto/auth.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({
    success: Type.Literal(true),
    data,
    message: Type.String(),
    requestId: Type.String(),
  });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export interface AuthRoutesOptions {
  controller: AuthController;
}

export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const { controller } = options;

  app.post("/login", {
    // P1 安全修复：登录接口限流，每个 IP 每分钟最多 10 次，防止暴力破解
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: {
      tags: ["认证"],
      summary: "用户登录",
      body: LoginBodySchema,
      response: { 200: success(AuthResultSchema) },
    },
    handler: controller.login,
  });

  app.post("/refresh", {
    // P1 安全修复：刷新令牌接口限流，防止枚举刷新令牌
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    schema: {
      tags: ["认证"],
      summary: "轮换访问令牌和刷新令牌",
      body: RefreshBodySchema,
      response: { 200: success(AuthResultSchema) },
    },
    handler: controller.refresh,
  });

  app.post("/logout", {
    schema: {
      tags: ["认证"],
      summary: "撤销刷新令牌",
      body: RefreshBodySchema,
      response: { 200: success(Type.Null()) },
    },
    handler: controller.logout,
  });

  app.get("/me", {
    preHandler: authenticate,
    schema: {
      tags: ["认证"],
      summary: "获取当前用户",
      security: [{ bearerAuth: [] }],
      response: { 200: success(AuthUserSchema) },
    },
    handler: controller.me,
  });
}
