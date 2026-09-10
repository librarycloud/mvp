import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { VoucherTemplateController } from "./voucher-template.controller.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function editor(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"], "仅会计或财务主管可以管理凭证模板");
}

export async function voucherTemplateRoutes(
  app: FastifyInstance,
  options: { controller: VoucherTemplateController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: { tags: ["常用凭证模板"], summary: "获取凭证模板列表", security: [{ bearerAuth: [] }] },
    handler: options.controller.list,
  });

  app.post("/", {
    preHandler: editor,
    schema: {
      tags: ["常用凭证模板"],
      summary: "创建常用凭证模板",
      security: [{ bearerAuth: [] }],
      body: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 100 }),
        category: Type.Optional(Type.Union([
          Type.Literal("SALARY"),
          Type.Literal("TAX"),
          Type.Literal("EXPENSE"),
          Type.Literal("FINANCE"),
          Type.Literal("COMMON"),
        ])),
        summary: Type.String({ minLength: 1, maxLength: 500 }),
        description: Type.Optional(Type.String({ maxLength: 500 })),
        entries: Type.Array(
          Type.Object({
            lineNo: Type.Integer({ minimum: 1 }),
            accountId: Type.Integer({ minimum: 1 }),
            direction: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]),
            summary: Type.String({ minLength: 1 }),
          }),
          { minItems: 2 },
        ),
      }),
    },
    handler: options.controller.create,
  });

  app.delete("/:id", {
    preHandler: editor,
    schema: {
      tags: ["常用凭证模板"],
      summary: "删除常用凭证模板",
      security: [{ bearerAuth: [] }],
      params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
    },
    handler: options.controller.remove,
  });
}
