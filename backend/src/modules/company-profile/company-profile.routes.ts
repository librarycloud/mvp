import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type as SchemaType, type TSchema } from "@sinclair/typebox";
import { unauthorized } from "../../common/errors/app-error.js";
import type { CompanyProfileController } from "./company-profile.controller.js";

const success = <T extends TSchema>(data: T) => SchemaType.Object({ success: SchemaType.Literal(true), data, message: SchemaType.String(), requestId: SchemaType.String() });
const nullableString = SchemaType.Union([SchemaType.String(), SchemaType.Null()]);
const profile = SchemaType.Union([SchemaType.Null(), SchemaType.Object({ id: SchemaType.Integer({ minimum: 1 }), name: SchemaType.String(), unifiedSocialCreditCode: SchemaType.String(), bankName: nullableString, bankAccount: nullableString, baseCurrency: SchemaType.String(), operationMode: SchemaType.Union([SchemaType.Literal("SIMPLE"), SchemaType.Literal("STANDARD")]) })]);
async function authenticate(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }

export async function companyProfileRoutes(app: FastifyInstance, options: { controller: CompanyProfileController }) {
  app.get("/", { preHandler: authenticate, schema: { tags: ["企业资料"], security: [{ bearerAuth: [] }], response: { 200: success(profile) } }, handler: options.controller.get });
  app.put("/", { preHandler: authenticate, schema: { tags: ["企业资料"], security: [{ bearerAuth: [] }], body: SchemaType.Object({ name: SchemaType.String({ minLength: 1, maxLength: 200 }), unifiedSocialCreditCode: SchemaType.String({ minLength: 15, maxLength: 18 }), bankName: SchemaType.Optional(SchemaType.String({ maxLength: 200 })), bankAccount: SchemaType.Optional(SchemaType.String({ maxLength: 100 })), operationMode: SchemaType.Optional(SchemaType.Union([SchemaType.Literal("SIMPLE"), SchemaType.Literal("STANDARD")])) }), response: { 200: success(profile) } }, handler: options.controller.save });
}
