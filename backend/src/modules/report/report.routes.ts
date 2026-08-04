import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { ReportController } from "./report.controller.js";
import { GenerateReportBodySchema, IncomeStatementPeriodSchema, ReportParamsSchema, ReportSchema } from "./dto/report.dto.js";

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function reportRoutes(app: FastifyInstance, options: { controller: ReportController }) {
  app.get("/", { preHandler: authenticate, schema: { tags: ["报表"], security: [{ bearerAuth: [] }], querystring: Type.Object({ page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })), pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })) }) }, handler: options.controller.list });
  app.post("/generate", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "按模板配置生成报表",
      description: "传入已启用的模板编码；新增报表无需修改生成程序。",
      security: [{ bearerAuth: [] }], body: GenerateReportBodySchema,
      response: { 201: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.generate,
  });
  app.post("/income-statement/generate", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "按配置生成利润表",
      description: "科目映射和公式从报表模板配置读取，不在程序中硬编码。",
      security: [{ bearerAuth: [] }], body: IncomeStatementPeriodSchema,
      response: { 201: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.generateIncomeStatement,
  });
  app.post("/balance-sheet/generate", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "按配置生成资产负债表",
      description: "期初和期末余额从模板的余额映射及公式依赖生成。",
      security: [{ bearerAuth: [] }], body: IncomeStatementPeriodSchema,
      response: { 201: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.generateBalanceSheet,
  });
  app.post("/cash-flow-statement/generate", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "按配置生成间接法现金流量表",
      description: "期间流量和期初期末现金余额均由模板映射及公式依赖生成。",
      security: [{ bearerAuth: [] }], body: IncomeStatementPeriodSchema,
      response: { 201: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.generateCashFlowStatement,
  });
  app.post("/equity-change-statement/generate", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "按配置生成所有者权益变动表",
      description: "所有者权益组成项目及变动金额由模板映射生成。",
      security: [{ bearerAuth: [] }], body: IncomeStatementPeriodSchema,
      response: { 201: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.generateEquityChangeStatement,
  });
  app.get("/:id", {
    preHandler: authenticate,
    schema: {
      tags: ["报表"], summary: "查询已生成报表", security: [{ bearerAuth: [] }], params: ReportParamsSchema,
      response: { 200: Type.Object({ success: Type.Literal(true), data: ReportSchema, message: Type.String(), requestId: Type.String() }) },
    },
    handler: options.controller.getById,
  });
  app.get("/:id/export.xlsx", { preHandler: authenticate, schema: { tags: ["报表"], security: [{ bearerAuth: [] }], params: ReportParamsSchema }, handler: options.controller.exportExcel });
  app.get("/:id/export.pdf", { preHandler: authenticate, schema: { tags: ["报表"], security: [{ bearerAuth: [] }], params: ReportParamsSchema }, handler: options.controller.exportPdf });
}
