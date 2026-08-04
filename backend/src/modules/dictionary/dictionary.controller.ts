import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { DictionaryService } from "./dictionary.service.js";
import type { DictionaryActor } from "./dictionary.types.js";
import type { CategoryBody, CategoryUpdateBody, CodeParams, IdParams, ItemBody } from "./dto/dictionary.dto.js";
export class DictionaryController {
  constructor(private readonly service: DictionaryService) {}
  list = async (_: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, this.service.listCategories());
  get = async (request: FastifyRequest<{ Params: CodeParams }>, reply: FastifyReply) => sendSuccess(reply, this.service.getCategory(request.params.code));
  items = async (request: FastifyRequest<{ Params: CodeParams }>, reply: FastifyReply) => sendSuccess(reply, this.service.getItems(request.params.code));
  createCategory = async (request: FastifyRequest<{ Body: CategoryBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.createCategory(request.body, this.actor(request)), "数据字典分类创建成功", 201);
  updateCategory = async (request: FastifyRequest<{ Params: IdParams; Body: CategoryUpdateBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.updateCategory(request.params.id, request.body, this.actor(request)), "数据字典分类更新成功");
  createItem = async (request: FastifyRequest<{ Params: CodeParams; Body: ItemBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.createItem(request.params.code, request.body, this.actor(request)), "数据字典项创建成功", 201);
  updateItem = async (request: FastifyRequest<{ Params: IdParams; Body: Partial<ItemBody> }>, reply: FastifyReply) => sendSuccess(reply, await this.service.updateItem(request.params.id, request.body, this.actor(request)), "数据字典项更新成功");
  removeItem = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => { await this.service.removeItem(request.params.id, this.actor(request)); return sendSuccess(reply, null, "数据字典项删除成功"); };
  private actor(request: FastifyRequest): DictionaryActor { const userAgent = request.headers["user-agent"]; return { actorId: Number(request.user.sub), role: request.user.role, requestId: request.id, ipAddress: request.ip, ...(userAgent ? { userAgent } : {}) }; }
}
