import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError, unauthorized } from "../../common/errors/app-error.js";
import type { AccountController } from "./account.controller.js";
import {
  AccountParamsSchema,
  AccountQuerySchema,
  AccountSchema,
  AccountTreeSchema,
  CreateAccountBodySchema,
  UpdateAccountBodySchema,
} from "./dto/account.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function requireAdmin(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  if (request.user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "仅管理员可以维护会计科目", 403);
  }
}

export async function accountRoutes(
  app: FastifyInstance,
  options: { controller: AccountController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["会计科目"],
      summary: "查询科目列表或科目树",
      security: [{ bearerAuth: [] }],
      querystring: AccountQuerySchema,
      response: { 200: success(Type.Union([Type.Array(AccountSchema), Type.Array(AccountTreeSchema)])) },
    },
    handler: options.controller.list,
  });

  app.get("/:id", {
    preHandler: authenticate,
    schema: {
      tags: ["会计科目"],
      summary: "查询科目详情",
      security: [{ bearerAuth: [] }],
      params: AccountParamsSchema,
      response: { 200: success(AccountSchema) },
    },
    handler: options.controller.getById,
  });

  app.post("/", {
    preHandler: requireAdmin,
    schema: {
      tags: ["会计科目"],
      summary: "新增明细科目",
      security: [{ bearerAuth: [] }],
      body: CreateAccountBodySchema,
      response: { 201: success(AccountSchema) },
    },
    handler: options.controller.create,
  });

  app.put("/:id", {
    preHandler: requireAdmin,
    schema: {
      tags: ["会计科目"],
      summary: "修改科目",
      security: [{ bearerAuth: [] }],
      params: AccountParamsSchema,
      body: UpdateAccountBodySchema,
      response: { 200: success(AccountSchema) },
    },
    handler: options.controller.update,
  });

  app.delete("/:id", {
    preHandler: requireAdmin,
    schema: {
      tags: ["会计科目"],
      summary: "软删除科目",
      security: [{ bearerAuth: [] }],
      params: AccountParamsSchema,
      response: { 200: success(Type.Null()) },
    },
    handler: options.controller.remove,
  });
}
