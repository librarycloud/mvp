import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { FixedAssetService } from "./fixed-asset.service.js";

export class FixedAssetController {
  constructor(private readonly service: FixedAssetService) {}
  create = async (r: FastifyRequest<{ Body: any }>, p: FastifyReply) => sendSuccess(p, await this.service.create(r.body, { actorId: Number(r.user.sub), role: r.user.role }), "固定资产创建成功", 201);
  list = async (r: FastifyRequest<{ Querystring: { status?: string; category?: string } }>, p: FastifyReply) => sendSuccess(p, await this.service.list(r.query));
  get = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.get(r.params.id));
  update = async (r: FastifyRequest<{ Params: { id: number }; Body: any }>, p: FastifyReply) => sendSuccess(p, await this.service.update(r.params.id, r.body, { actorId: Number(r.user.sub), role: r.user.role }), "固定资产修改成功");
  status = async (r: FastifyRequest<{ Params: { id: number }; Body: { status: number | string } }>, p: FastifyReply) => sendSuccess(p, await this.service.changeStatus(r.params.id, Number(r.body.status), { actorId: Number(r.user.sub), role: r.user.role }));
  dispose = async (r: FastifyRequest<{ Params: { id: number }; Body: { disposalType: string; disposalDate: string; proceeds?: string; reason?: string; proceedsAccountId?: number; gainLossAccountId?: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.dispose(r.params.id, r.body, { actorId: Number(r.user.sub), role: r.user.role }), "固定资产处置凭证已生成", 201);
  disposals = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.disposals(r.params.id));
}
