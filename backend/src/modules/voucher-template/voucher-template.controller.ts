import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { VoucherTemplateService } from "./voucher-template.service.js";
import type { CreateVoucherTemplateInput } from "./voucher-template.types.js";

export class VoucherTemplateController {
  constructor(private readonly service: VoucherTemplateService) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, await this.service.list());
  };

  create = async (request: FastifyRequest<{ Body: CreateVoucherTemplateInput }>, reply: FastifyReply) => {
    return sendSuccess(reply, await this.service.create(request.body), "模板创建成功", 201);
  };

  remove = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => {
    await this.service.remove(Number(request.params.id));
    return sendSuccess(reply, null, "模板删除成功");
  };
}
