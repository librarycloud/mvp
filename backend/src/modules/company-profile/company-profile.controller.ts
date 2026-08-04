import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { CompanyProfileService } from "./company-profile.service.js";

export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}
  get = async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, await this.service.get());
  save = async (request: FastifyRequest<{ Body: { name: string; unifiedSocialCreditCode: string; bankName?: string; bankAccount?: string; operationMode?: "SIMPLE" | "STANDARD" } }>, reply: FastifyReply) => {
    if (request.user.role !== "ADMIN") throw new AppError("FORBIDDEN", "只有管理员可以修改企业资料", 403);
    return sendSuccess(reply, await this.service.save(request.body, Number(request.user.sub)), "企业资料已保存");
  };
}
