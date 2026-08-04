import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { LoginBody, RefreshBody } from "./dto/auth.dto.js";
import type { AuthService } from "./auth.service.js";
import type { RequestContext } from "./auth.types.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const result = await this.service.login(request.body, this.context(request));
    return sendSuccess(reply, result, "登录成功");
  };

  refresh = async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const result = await this.service.refresh(request.body.refreshToken);
    return sendSuccess(reply, result, "令牌刷新成功");
  };

  logout = async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    await this.service.logout(request.body.refreshToken);
    return sendSuccess(reply, null, "退出成功");
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.service.getCurrentUser(Number(request.user.sub));
    return sendSuccess(reply, user);
  };

  private context(request: FastifyRequest): RequestContext {
    const context: RequestContext = { ipAddress: request.ip, requestId: request.id };
    const userAgent = request.headers["user-agent"];
    if (userAgent) context.userAgent = userAgent;
    return context;
  }
}
