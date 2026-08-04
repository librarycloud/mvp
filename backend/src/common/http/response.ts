import type { FastifyReply } from "fastify";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  requestId: string;
}

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message = "操作成功",
  statusCode = 200,
) {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    message,
    requestId: reply.request.id,
  };
  return reply.code(statusCode).send(body);
}
