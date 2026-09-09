import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { ReportService } from "./report.service.js";
import type { ReportExportService } from "./report-export.service.js";
import type { GenerateReportBody, IncomeStatementPeriod, ReportParams } from "./dto/report.dto.js";

export class ReportController {
  constructor(private readonly service: ReportService, private readonly exporter: ReportExportService) {}

  generateIncomeStatement = async (
    request: FastifyRequest<{ Body: IncomeStatementPeriod }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.generateIncomeStatement(request.body, Number(request.user.sub)), "利润表生成成功", 201);

  generateBalanceSheet = async (
    request: FastifyRequest<{ Body: IncomeStatementPeriod }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.generateBalanceSheet(request.body, Number(request.user.sub)), "资产负债表生成成功", 201);

  generateCashFlowStatement = async (
    request: FastifyRequest<{ Body: IncomeStatementPeriod }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.generateCashFlowStatement(request.body, Number(request.user.sub)), "现金流量表生成成功", 201);

  generateCashFlowIndirect = async (
    request: FastifyRequest<{ Body: IncomeStatementPeriod }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.generateCashFlowIndirect(request.body), "现金流量表补充资料（间接法）生成成功");

  generateEquityChangeStatement = async (
    request: FastifyRequest<{ Body: IncomeStatementPeriod }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.generateEquityChangeStatement(request.body, Number(request.user.sub)), "所有者权益变动表生成成功", 201);

  generate = async (request: FastifyRequest<{ Body: GenerateReportBody }>, reply: FastifyReply) => {
    const { templateCode, ...period } = request.body;
    return sendSuccess(reply, await this.service.generate(templateCode, period, Number(request.user.sub)), "报表生成成功", 201);
  };

  getById = async (request: FastifyRequest<{ Params: ReportParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.getReport(request.params.id));

  list = async (request: FastifyRequest<{ Querystring: { page?: number; pageSize?: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.listReports(request.query.page, request.query.pageSize));

  exportExcel = async (request: FastifyRequest<{ Params: ReportParams }>, reply: FastifyReply) =>
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="report-${request.params.id}.xlsx"`).send(await this.exporter.excel(request.params.id, Number(request.user.sub)));

  exportPdf = async (request: FastifyRequest<{ Params: ReportParams }>, reply: FastifyReply) =>
    reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="report-${request.params.id}.pdf"`).send(await this.exporter.pdf(request.params.id, Number(request.user.sub)));

  drillDown = async (request: FastifyRequest<{ Params: { id: number; itemId: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.drillDown(Number(request.params.id), Number(request.params.itemId)));
}
