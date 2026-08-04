import { Type, type TSchema } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AiSuggestionController } from "./ai-suggestion.controller.js";
import {
  AiSuggestionParamsSchema,
  AiSuggestionSchema,
  CreateAiSuggestionBodySchema,
} from "./dto/ai-suggestion.dto.js";

const success = <T extends TSchema>(data: T) =>
  Type.Object({ success: Type.Literal(true), data, message: Type.String(), requestId: Type.String() });

async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
  if (request.user.type !== "access") throw unauthorized("请使用访问令牌");
}

export async function aiSuggestionRoutes(
  app: FastifyInstance,
  options: { controller: AiSuggestionController },
) {
  app.post("/", {
    preHandler: authenticate,
    schema: {
      tags: ["AI 凭证建议"],
      summary: "根据银行流水或发票生成会计科目建议",
      description: "AI 仅建议摘要和科目，不生成或计算金额。",
      security: [{ bearerAuth: [] }],
      body: CreateAiSuggestionBodySchema,
      response: { 201: success(AiSuggestionSchema) },
    },
    handler: options.controller.generate,
  });

  app.get("/:id", {
    preHandler: authenticate,
    schema: {
      tags: ["AI 凭证建议"],
      summary: "查询 AI 凭证建议",
      security: [{ bearerAuth: [] }],
      params: AiSuggestionParamsSchema,
      response: { 200: success(AiSuggestionSchema) },
    },
    handler: options.controller.getById,
  });

  app.post("/:id/reject", {
    preHandler: authenticate,
    schema: {
      tags: ["AI 凭证建议"],
      summary: "拒绝 AI 凭证建议",
      security: [{ bearerAuth: [] }],
      params: AiSuggestionParamsSchema,
      response: { 200: success(AiSuggestionSchema) },
    },
    handler: options.controller.reject,
  });
}
