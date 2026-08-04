import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { AccountService } from "./account.service.js";
import type { AccountListFilter, AccountMutationContext } from "./account.types.js";
import type {
  AccountParams,
  AccountQuery,
  CreateAccountBody,
  UpdateAccountBody,
} from "./dto/account.dto.js";

export class AccountController {
  constructor(private readonly service: AccountService) {}

  list = async (request: FastifyRequest<{ Querystring: AccountQuery }>, reply: FastifyReply) => {
    const filter: AccountListFilter = {};
    if (request.query.keyword !== undefined) filter.keyword = request.query.keyword;
    if (request.query.category !== undefined) filter.category = request.query.category;
    if (request.query.isEnabled !== undefined) filter.isEnabled = request.query.isEnabled;
    const result = await this.service.list(filter, request.query.tree ?? true);
    return sendSuccess(reply, result);
  };

  getById = async (request: FastifyRequest<{ Params: AccountParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.getById(request.params.id));

  create = async (
    request: FastifyRequest<{ Body: CreateAccountBody }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.create(request.body, this.context(request)), "科目创建成功", 201);

  update = async (
    request: FastifyRequest<{ Params: AccountParams; Body: UpdateAccountBody }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.update(request.params.id, request.body, this.context(request)), "科目修改成功");

  remove = async (request: FastifyRequest<{ Params: AccountParams }>, reply: FastifyReply) => {
    await this.service.remove(request.params.id, this.context(request));
    return sendSuccess(reply, null, "科目删除成功");
  };

  private context(request: FastifyRequest): AccountMutationContext {
    const context: AccountMutationContext = {
      actorId: Number(request.user.sub),
      ipAddress: request.ip,
      requestId: request.id,
    };
    const userAgent = request.headers["user-agent"];
    if (userAgent) context.userAgent = userAgent;
    return context;
  }
}
