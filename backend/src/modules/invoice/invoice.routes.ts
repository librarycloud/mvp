import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../common/auth/authorization.js";
import { AppError, unauthorized } from "../../common/errors/app-error.js";
import type { InvoiceController } from "./invoice.controller.js";
import {
  InvoiceDetailSchema,
  InvoiceBatchImportSummarySchema,
  InvoiceImportQuerySchema,
  InvoiceParamsSchema,
  InvoiceVoucherBodySchema,
  InvoiceVoucherParamsSchema,
  InvoiceQuerySchema,
  InvoiceSchema,
  TaxDeductionBodySchema,
} from "./dto/invoice.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}
async function authenticateAdmin(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  if (request.user.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以修改发票与凭证的关联", 403);
}
async function authenticateEditor(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"], "仅会计或财务主管可以核验发票及确认抵扣");
}
async function authenticateManager(request: FastifyRequest): Promise<void> {
  await authenticate(request);
  requireRole(request.user.role, ["ADMIN", "FINANCE_MANAGER"], "仅财务主管可以作废发票");
}

export async function invoiceRoutes(app: FastifyInstance, options: { controller: InvoiceController }) {
  app.post("/import/xml", {
    preHandler: authenticate,
    schema: {
      tags: ["电子发票"],
      summary: "导入 XML 电子发票",
      description: "使用 multipart/form-data 上传名为 file 的 XML 文件，最多 10 个，每个最大 10MB。",
      consumes: ["multipart/form-data"],
      querystring: InvoiceImportQuerySchema,
      security: [{ bearerAuth: [] }],
      response: { 201: success(InvoiceBatchImportSummarySchema) },
    },
    handler: options.controller.importXml,
  });

  app.post("/import/document", {
    preHandler: authenticate,
    schema: { tags: ["电子发票"], summary: "归档 OFD/PDF 电子发票", description: "不执行图片识别或 OCR；请随文件提交已经确认的发票结构化字段。", consumes: ["multipart/form-data"], querystring: InvoiceImportQuerySchema, security: [{ bearerAuth: [] }] },
    handler: options.controller.importDocument,
  });

  app.get("/", {
    preHandler: authenticate,
    schema: {
      tags: ["电子发票"],
      summary: "分页查询电子发票",
      security: [{ bearerAuth: [] }],
      querystring: InvoiceQuerySchema,
      response: {
        200: success(
          Type.Object({
            items: Type.Array(InvoiceSchema),
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
    preHandler: authenticate,
    schema: {
      tags: ["电子发票"],
      summary: "查询电子发票及商品明细",
      security: [{ bearerAuth: [] }],
      params: InvoiceParamsSchema,
      response: { 200: success(InvoiceDetailSchema) },
    },
    handler: options.controller.getById,
  });
  app.put("/:id/tax-deduction", { preHandler: authenticateEditor, schema: { tags: ["电子发票"], summary: "确认进项发票抵扣处理", security: [{ bearerAuth: [] }], params: InvoiceParamsSchema, body: TaxDeductionBodySchema, response: { 200: success(InvoiceSchema) } }, handler: options.controller.updateTaxDeduction });
  app.post("/:id/verify", { preHandler: authenticateEditor, schema: { tags: ["电子发票"], summary: "人工核验发票", description: "记录财务人员已依据票面和外部渠道完成核对；本接口不调用税务机关验真服务。", security: [{ bearerAuth: [] }], params: InvoiceParamsSchema, response: { 200: success(InvoiceSchema) } }, handler: options.controller.verify });
  app.post("/:id/void", { preHandler: authenticateManager, schema: { tags: ["电子发票"], summary: "作废发票", security: [{ bearerAuth: [] }], params: InvoiceParamsSchema, response: { 200: success(InvoiceSchema) } }, handler: options.controller.void });
  app.post("/:id/red-letter", { preHandler: authenticateAdmin, schema: { tags: ["电子发票"], summary: "关联红字发票", security: [{ bearerAuth: [] }], params: InvoiceParamsSchema, body: Type.Object({ redInvoiceId: Type.Integer({ minimum: 1 }) }) }, handler: options.controller.linkRedLetter });
  app.post("/:id/vouchers", { preHandler: authenticateAdmin, schema: { tags: ["电子发票"], summary: "关联已有记账凭证", security: [{ bearerAuth: [] }], params: InvoiceParamsSchema, body: InvoiceVoucherBodySchema, response: { 200: success(InvoiceDetailSchema) } }, handler: options.controller.linkVoucher });
  app.delete("/:id/vouchers/:voucherId", { preHandler: authenticateAdmin, schema: { tags: ["电子发票"], summary: "解除已有凭证关联", security: [{ bearerAuth: [] }], params: InvoiceVoucherParamsSchema, response: { 200: success(InvoiceDetailSchema) } }, handler: options.controller.unlinkVoucher });
  app.get("/sales-requests", { preHandler: authenticate, schema: { tags: ["销项开票"], security: [{ bearerAuth: [] }] }, handler: options.controller.listSalesRequests });
  app.post("/sales-requests", { preHandler: authenticate, schema: { tags: ["销项开票"], security: [{ bearerAuth: [] }], body: Type.Object({ buyerName: Type.String({ minLength: 1, maxLength: 200 }), buyerIdNum: Type.String({ minLength: 1, maxLength: 64 }), invoiceType: Type.Union([Type.Literal("SPECIAL"), Type.Literal("ORDINARY")]), amountWithoutTax: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }), taxAmount: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }), items: Type.Optional(Type.Any()), remark: Type.Optional(Type.String({ maxLength: 500 })) }) }, handler: options.controller.createSalesRequest });
  app.post("/sales-requests/:id/approve", { preHandler: authenticateAdmin, schema: { tags: ["销项开票"], security: [{ bearerAuth: [] }], params: Type.Object({ id: Type.Integer({ minimum: 1 }) }) }, handler: options.controller.approveSalesRequest });
  app.post("/sales-requests/:id/reject", { preHandler: authenticateAdmin, schema: { tags: ["销项开票"], security: [{ bearerAuth: [] }], params: Type.Object({ id: Type.Integer({ minimum: 1 }) }), body: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }) }, handler: options.controller.rejectSalesRequest });
  app.post("/sales-requests/:id/issue", { preHandler: authenticateAdmin, schema: { tags: ["销项开票"], security: [{ bearerAuth: [] }], params: Type.Object({ id: Type.Integer({ minimum: 1 }) }), body: Type.Object({ invoiceId: Type.Integer({ minimum: 1 }) }) }, handler: options.controller.issueSalesRequest });
}
