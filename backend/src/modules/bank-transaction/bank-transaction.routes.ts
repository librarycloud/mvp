import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import { requireRole } from "../../common/auth/authorization.js";
import type { BankTransactionController } from "./bank-transaction.controller.js";
import {
  BankImportSummarySchema,
  BankFetchBodySchema,
  BankFetchConfigSchema,
  SavedBankFetchConfigSchema,
  BankTransactionParamsSchema,
  BankTransactionQuerySchema,
  BankTransactionSchema,
  BankGenerateVoucherBodySchema,
} from "./dto/bank-transaction.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

async function manageConfig(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅管理员或财务主管可以维护招商银行配置");
}

async function operateBank(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT", "CASHIER"], "仅财务人员可以操作银行流水");
}

export async function bankTransactionRoutes(
  app: FastifyInstance,
  options: { controller: BankTransactionController },
) {
  app.get("/fetch-config", {
    preHandler: manageConfig,
    schema: {
      tags: ["银行流水"],
      summary: "读取已保存的招商银行接口配置",
      security: [{ bearerAuth: [] }],
      response: { 200: success(Type.Union([SavedBankFetchConfigSchema, Type.Null()])) },
    },
    handler: options.controller.getFetchConfig,
  });

  app.put("/fetch-config", {
    preHandler: manageConfig,
    schema: {
      tags: ["银行流水"],
      summary: "保存招商银行接口配置",
      security: [{ bearerAuth: [] }],
      body: BankFetchConfigSchema,
      response: { 200: success(SavedBankFetchConfigSchema) },
    },
    handler: options.controller.saveFetchConfig,
  });

  app.post("/fetch", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "按招商银行接口配置拉取交易流水",
      description: "按 trsQryByBreakPoint 接口请求并自动完成断点续传，再将全部交易导入系统。",
      security: [{ bearerAuth: [] }],
      body: BankFetchBodySchema,
      response: { 201: success(BankImportSummarySchema) },
    },
    handler: options.controller.fetchTransactions,
  });

  app.post("/import", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "导入 xlsx 或 csv 银行流水",
      description: "使用 multipart/form-data 上传名为 file 的单个文件，最大 20MB。招商银行 JSON 流水请使用接口拉取功能。",
      consumes: ["multipart/form-data"],
      security: [{ bearerAuth: [] }],
      response: { 201: success(BankImportSummarySchema) },
    },
    handler: options.controller.importFile,
  });

  app.get("/", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "分页查询银行流水",
      security: [{ bearerAuth: [] }],
      querystring: BankTransactionQuerySchema,
      response: {
        200: success(
          Type.Object({
            items: Type.Array(BankTransactionSchema),
            total: Type.Integer(),
            page: Type.Integer(),
            pageSize: Type.Integer(),
            totalPages: Type.Integer(),
          }),
        ),
      },
    },
    handler: options.controller.list,
  });

  app.get("/:id", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "查询银行流水详情",
      security: [{ bearerAuth: [] }],
      params: BankTransactionParamsSchema,
      response: { 200: success(BankTransactionSchema) },
    },
    handler: options.controller.getById,
  });

  app.post("/:id/vouchers", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "关联记账凭证",
      security: [{ bearerAuth: [] }],
      params: BankTransactionParamsSchema,
      body: Type.Object({ voucherId: Type.Integer({ minimum: 1 }) }),
      response: { 200: success(BankTransactionSchema) },
    },
    handler: options.controller.linkVoucher,
  });

  app.post("/:id/generate-voucher", {
    preHandler: operateBank,
    schema: {
      tags: ["银行流水"],
      summary: "银行流水一键生成记账凭证",
      security: [{ bearerAuth: [] }],
      params: BankTransactionParamsSchema,
      body: BankGenerateVoucherBodySchema,
    },
    handler: options.controller.generateVoucher,
  });
}
