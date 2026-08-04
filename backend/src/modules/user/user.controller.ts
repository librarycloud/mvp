import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { CreateUserInput, UpdateUserInput, UserService } from "./user.service.js";

export class UserController {
  constructor(private readonly service: UserService) {}
  list = async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, await this.service.list());
  create = async (request: FastifyRequest<{ Body: CreateUserInput }>, reply: FastifyReply) => sendSuccess(reply, await this.service.create(request.body, Number(request.user.sub)), "用户已创建", 201);
  update = async (request: FastifyRequest<{ Params: { id: number }; Body: UpdateUserInput }>, reply: FastifyReply) => sendSuccess(reply, await this.service.update(request.params.id, request.body, Number(request.user.sub)), "用户已更新");
  getSessionSettings = async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, { idleTimeoutMinutes: await this.service.getIdleTimeoutMinutes() });
  setSessionSettings = async (request: FastifyRequest<{ Body: { idleTimeoutMinutes: number } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.setIdleTimeoutMinutes(request.body.idleTimeoutMinutes, Number(request.user.sub)), "无操作退出时间已更新");
}
