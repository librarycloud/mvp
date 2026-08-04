import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { AiSuggestionService } from "./ai-suggestion.service.js";
import type { SuggestionRequester } from "./ai-suggestion.types.js";
import type {
  AiSuggestionParams,
  CreateAiSuggestionBody,
} from "./dto/ai-suggestion.dto.js";

export class AiSuggestionController {
  constructor(private readonly service: AiSuggestionService) {}

  generate = async (
    request: FastifyRequest<{ Body: CreateAiSuggestionBody }>,
    reply: FastifyReply,
  ) =>
    sendSuccess(
      reply,
      await this.service.generate(request.body, this.requester(request)),
      "AI 凭证建议生成成功",
      201,
    );

  getById = async (
    request: FastifyRequest<{ Params: AiSuggestionParams }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.getById(request.params.id, this.requester(request)));

  reject = async (
    request: FastifyRequest<{ Params: AiSuggestionParams }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.reject(request.params.id, this.requester(request)), "AI 建议已拒绝");

  private requester(request: FastifyRequest): SuggestionRequester {
    const requester: SuggestionRequester = {
      actorId: Number(request.user.sub),
      role: request.user.role,
      requestId: request.id,
      ipAddress: request.ip,
    };
    const userAgent = request.headers["user-agent"];
    if (userAgent) requester.userAgent = userAgent;
    return requester;
  }
}
