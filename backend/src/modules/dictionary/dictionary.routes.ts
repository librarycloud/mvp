import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError, unauthorized } from "../../common/errors/app-error.js";
import type { DictionaryController } from "./dictionary.controller.js";
import { CategoryBodySchema, CategorySchema, CategoryUpdateBodySchema, CodeParamsSchema, IdParamsSchema, ItemBodySchema, ItemSchema } from "./dto/dictionary.dto.js";
const success = <T extends TSchema>(data: T) => Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });
async function auth(request: FastifyRequest) { await request.jwtVerify(); if (request.user.type !== "access") throw unauthorized("请使用访问令牌"); }
async function admin(request: FastifyRequest) { await auth(request); if (request.user.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以维护数据字典", 403); }
export async function dictionaryRoutes(app: FastifyInstance, options: { controller: DictionaryController }) {
  app.get("/", { preHandler: auth, schema: { tags: ["数据字典"], security: [{ bearerAuth: [] }], response: { 200: success(Type.Array(Type.Omit(CategorySchema, ["items"]))) } }, handler: options.controller.list });
  app.get("/:code", { preHandler: auth, schema: { tags: ["数据字典"], params: CodeParamsSchema, security: [{ bearerAuth: [] }], response: { 200: success(Type.Array(ItemSchema)) } }, handler: options.controller.items });
  app.get("/categories/:code", { preHandler: auth, schema: { tags: ["数据字典"], params: CodeParamsSchema, security: [{ bearerAuth: [] }], response: { 200: success(CategorySchema) } }, handler: options.controller.get });
  app.post("/categories", { preHandler: admin, schema: { tags: ["数据字典"], body: CategoryBodySchema, security: [{ bearerAuth: [] }] }, handler: options.controller.createCategory });
  app.put("/categories/:id", { preHandler: admin, schema: { tags: ["数据字典"], params: IdParamsSchema, body: CategoryUpdateBodySchema, security: [{ bearerAuth: [] }] }, handler: options.controller.updateCategory });
  app.post("/:code/items", { preHandler: admin, schema: { tags: ["数据字典"], params: CodeParamsSchema, body: ItemBodySchema, security: [{ bearerAuth: [] }] }, handler: options.controller.createItem });
  app.put("/items/:id", { preHandler: admin, schema: { tags: ["数据字典"], params: IdParamsSchema, body: Type.Partial(ItemBodySchema), security: [{ bearerAuth: [] }] }, handler: options.controller.updateItem });
  app.delete("/items/:id", { preHandler: admin, schema: { tags: ["数据字典"], params: IdParamsSchema, security: [{ bearerAuth: [] }] }, handler: options.controller.removeItem });
}
