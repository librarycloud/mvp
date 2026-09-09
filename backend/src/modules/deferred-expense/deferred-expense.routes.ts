import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { unauthorized } from "../../common/errors/app-error.js";
import type { DeferredExpenseController } from "./deferred-expense.controller.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function editor(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"], "仅会计或财务主管可以操作长期待摊费用");
}

const CreateDeferredExpenseSchema = Type.Object({
  expenseNo: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  originalValue: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }),
  usefulLifeMonths: Type.Integer({ minimum: 1, maximum: 600 }),
  startDate: Type.String({ format: "date" }),
  department: Type.Optional(Type.String({ maxLength: 100 })),
  custodian: Type.Optional(Type.String({ maxLength: 100 })),
  expenseAccountId: Type.Optional(Type.Integer({ minimum: 1 })),
});

export async function deferredExpenseRoutes(
  app: FastifyInstance,
  options: { controller: DeferredExpenseController },
) {
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["长期待摊费用"],
      summary: "查询长期待摊费用列表",
      security: [{ bearerAuth: [] }],
      querystring: Type.Object({
        status: Type.Optional(Type.Integer()),
        keyword: Type.Optional(Type.String()),
      }),
    },
    handler: options.controller.list,
  });

  app.post("/", {
    preHandler: editor,
    schema: {
      tags: ["长期待摊费用"],
      summary: "新增长期待摊费用",
      security: [{ bearerAuth: [] }],
      body: CreateDeferredExpenseSchema,
    },
    handler: options.controller.create,
  });

  app.post("/amortize", {
    preHandler: editor,
    schema: {
      tags: ["长期待摊费用"],
      summary: "按月计提摊销凭证",
      security: [{ bearerAuth: [] }],
      body: Type.Object({ periodId: Type.Integer({ minimum: 1 }) }),
    },
    handler: options.controller.amortize,
  });
}
