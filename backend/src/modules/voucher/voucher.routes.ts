import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { VoucherController } from "./voucher.controller.js";
import {
  VoucherAttachmentParamsSchema,
  VoucherAttachmentSchema,
  VoucherBatchBodySchema,
  VoucherBatchResultSchema,
  VoucherDetailSchema,
  VoucherParamsSchema,
  VoucherQuerySchema,
  VoucherSchema,
  VoucherSuggestionParamsSchema,
  VoucherVoidBodySchema,
  VoucherWriteBodySchema,
} from "./dto/voucher.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function voucherRoutes(app: FastifyInstance, options: { controller: VoucherController }) {
  app.post("/", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "手工新增凭证", security: [{ bearerAuth: [] }], body: VoucherWriteBodySchema, response: { 201: success(VoucherDetailSchema) } },
    handler: options.controller.create,
  });
  app.post("/from-ai/:suggestionId", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"], summary: "确认 AI 建议并生成凭证", description: "最终金额由用户提交并由程序校验，AI 不提供金额。",
      security: [{ bearerAuth: [] }], params: VoucherSuggestionParamsSchema, body: VoucherWriteBodySchema,
      response: { 201: success(VoucherDetailSchema) },
    },
    handler: options.controller.createFromAi,
  });
  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"], summary: "分页查询凭证", security: [{ bearerAuth: [] }], querystring: VoucherQuerySchema,
      response: { 200: success(Type.Object({ items: Type.Array(VoucherSchema), total: Type.Integer(), page: Type.Integer(), pageSize: Type.Integer(), totalPages: Type.Integer() })) },
    },
    handler: options.controller.list,
  });
  app.post("/batch/submit", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "批量提交凭证", security: [{ bearerAuth: [] }], body: VoucherBatchBodySchema, response: { 200: success(VoucherBatchResultSchema) } },
    handler: options.controller.batchSubmit,
  });
  app.post("/batch/review", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "管理员批量审核凭证", security: [{ bearerAuth: [] }], body: VoucherBatchBodySchema, response: { 200: success(VoucherBatchResultSchema) } },
    handler: options.controller.batchReview,
  });
  app.post("/batch/post", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "管理员批量记账凭证", security: [{ bearerAuth: [] }], body: VoucherBatchBodySchema, response: { 200: success(VoucherBatchResultSchema) } },
    handler: options.controller.batchPost,
  });
  app.post("/reorder", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"],
      summary: "凭证断号重排与整理",
      security: [{ bearerAuth: [] }],
      body: Type.Object({
        fiscalYear: Type.Integer({ minimum: 2000, maximum: 9999 }),
        fiscalPeriod: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
      }),
      response: {
        200: success(Type.Object({ totalReordered: Type.Integer(), gapsFixed: Type.Integer() })),
      },
    },
    handler: options.controller.reorder,
  });
  app.get("/:id", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "查询凭证详情", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } },
    handler: options.controller.getById,
  });
  app.put("/:id", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "修改草稿凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, body: VoucherWriteBodySchema, response: { 200: success(VoucherDetailSchema) } },
    handler: options.controller.update,
  });
  app.delete("/:id", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "软删除草稿凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(Type.Null()) } },
    handler: options.controller.remove,
  });
  app.post("/:id/review", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "管理员审核凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } },
    handler: options.controller.review,
  });
  app.post("/:id/submit", { preHandler: authenticate, schema: { tags: ["凭证"], summary: "提交凭证审核", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } }, handler: options.controller.submit });
  app.post("/:id/unreview", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "管理员反审核凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } },
    handler: options.controller.unreview,
  });
  app.post("/:id/post", { preHandler: authenticate, schema: { tags: ["凭证"], summary: "管理员记账凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } }, handler: options.controller.post });
  app.post("/:id/unpost", { preHandler: authenticate, schema: { tags: ["凭证"], summary: "管理员取消记账", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } }, handler: options.controller.unpost });
  app.post("/:id/void", { preHandler: authenticate, schema: { tags: ["凭证"], summary: "管理员作废已记账凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, body: VoucherVoidBodySchema, response: { 200: success(VoucherDetailSchema) } }, handler: options.controller.voidVoucher });
  app.post("/:id/restore", { preHandler: authenticate, schema: { tags: ["凭证"], summary: "管理员恢复作废凭证", security: [{ bearerAuth: [] }], params: VoucherParamsSchema, response: { 200: success(VoucherDetailSchema) } }, handler: options.controller.restore });
  app.post("/:id/attachments", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"], summary: "上传草稿凭证附件", description: "multipart/form-data 字段 file，最大20MB。",
      consumes: ["multipart/form-data"], security: [{ bearerAuth: [] }], params: VoucherAttachmentParamsSchema,
      response: { 201: success(VoucherAttachmentSchema) },
    },
    handler: options.controller.addAttachment,
  });
  app.post("/:id/cashier-sign", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"],
      summary: "出纳凭证签字",
      security: [{ bearerAuth: [] }],
      params: VoucherParamsSchema,
    },
    handler: options.controller.cashierSign,
  });
  app.get("/cashier-journal", {
    preHandler: authenticate,
    schema: {
      tags: ["账簿"],
      summary: "出纳日记账查询",
      security: [{ bearerAuth: [] }],
      querystring: Type.Object({
        accountCode: Type.Optional(Type.String({ maxLength: 32 })),
        startDate: Type.String({ format: "date" }),
        endDate: Type.String({ format: "date" }),
      }),
    },
    handler: options.controller.cashierJournal,
  });
  app.get("/import-template", {
    preHandler: authenticate,
    schema: { tags: ["凭证"], summary: "下载凭证批量导入 Excel 模板", security: [{ bearerAuth: [] }] },
    handler: options.controller.downloadImportTemplate,
  });
  app.post("/import", {
    preHandler: authenticate,
    schema: {
      tags: ["凭证"],
      summary: "批量导入记账凭证",
      description: "支持上传 Excel (.xlsx) 或 CSV 凭证导入文件，预分配凭证号原子保存",
      consumes: ["multipart/form-data"],
      security: [{ bearerAuth: [] }],
    },
    handler: options.controller.importVouchers,
  });
}
