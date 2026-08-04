import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { CreateTemplateBody, TemplateConfigBody, TemplateIdParams } from "./dto/report-template.dto.js";
import type { ReportTemplateService, TemplateActor } from "./report-template.service.js";

export class ReportTemplateController {
  constructor(private readonly service: ReportTemplateService) {}
  list = async (request: FastifyRequest<{ Querystring: { code?: string } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.list(request.query.code));
  detail = async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.detail(request.params.id));
  create = async (request: FastifyRequest<{ Body: CreateTemplateBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.create(request.body, this.actor(request)), "报表模板创建成功", 201);
  publish = async (request: FastifyRequest<{ Params: TemplateIdParams; Body: TemplateConfigBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.publish(request.params.id, request.body, this.actor(request)), "报表模板新版本发布成功", 201);
  activate = async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.activate(request.params.id, this.actor(request)), "报表模板已启用");
  deactivate = async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.deactivate(request.params.id, this.actor(request)), "报表模板已停用");
  private actor(request: FastifyRequest): TemplateActor { return { actorId: Number(request.user.sub), role: request.user.role }; }
}
