import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../errors/app-error.js";
import { formatValidationMessage } from "./validation-message.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id,
      });
    }

    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message: formatValidationMessage(error.validation), details: error.validation },
        requestId: request.id,
      });
    }

    if (error.statusCode === 401 || error.code?.startsWith("FST_JWT")) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "访问令牌无效或已过期" },
        requestId: request.id,
      });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      const code = error.statusCode === 413 ? "FILE_TOO_LARGE" : "REQUEST_ERROR";
      const message = error.statusCode === 413 ? "上传文件超过大小限制" : error.message;
      return reply.code(error.statusCode).send({
        success: false,
        error: { code, message },
        requestId: request.id,
      });
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "服务器内部错误" },
      requestId: request.id,
    });
  });
}
