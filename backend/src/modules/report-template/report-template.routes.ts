import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import { CreateTemplateBodySchema, TemplateConfigBodySchema, TemplateIdParamsSchema, TemplateListQuerySchema } from "./dto/report-template.dto.js";
import type { ReportTemplateController } from "./report-template.controller.js";

const success = <T extends TSchema>(data: T) => Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });
async function authenticate(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
const template = Type.Object({ id: Type.Integer(), code: Type.String(), name: Type.String(), type: Type.String(), version: Type.Integer(), isActive: Type.Boolean(), description: Type.Union([Type.String(), Type.Null()]), createdAt: Type.String(), updatedAt: Type.String(), deletedAt: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: true });

export async function reportTemplateRoutes(app: FastifyInstance, options: { controller: ReportTemplateController }) {
  app.get("/", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], querystring: TemplateListQuerySchema, response: { 200: success(Type.Array(Type.Any())) } }, handler: options.controller.list });
  app.post("/", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], body: CreateTemplateBodySchema, response: { 201: success(template) } }, handler: options.controller.create });
  app.get("/:id", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], params: TemplateIdParamsSchema, response: { 200: success(Type.Any()) } }, handler: options.controller.detail });
  app.post("/:id/versions", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], params: TemplateIdParamsSchema, body: TemplateConfigBodySchema, response: { 201: success(template) } }, handler: options.controller.publish });
  app.post("/:id/activate", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], params: TemplateIdParamsSchema, response: { 200: success(template) } }, handler: options.controller.activate });
  app.post("/:id/deactivate", { preHandler: authenticate, schema: { tags: ["报表模板"], security: [{ bearerAuth: [] }], params: TemplateIdParamsSchema, response: { 200: success(template) } }, handler: options.controller.deactivate });
}
