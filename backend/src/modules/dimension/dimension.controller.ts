import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { DimensionService } from "./dimension.service.js";
import type { DimensionActor, DimensionInput, DimensionMemberInput, DimensionRuleInput } from "./dimension.types.js";

export class DimensionController {
  constructor(private readonly service: DimensionService) {}
  list = async (_: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, await this.service.list());
  create = async (r: FastifyRequest<{ Body: DimensionInput }>, p: FastifyReply) => sendSuccess(p, await this.service.create(r.body, this.actor(r)), "辅助核算维度已创建", 201);
  update = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<DimensionInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.update(r.params.id, r.body, this.actor(r)), "辅助核算维度已更新");
  createMember = async (r: FastifyRequest<{ Params: { id: number }; Body: DimensionMemberInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createMember(r.params.id, r.body, this.actor(r)), "辅助核算成员已创建", 201);
  updateMember = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<DimensionMemberInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateMember(r.params.id, r.body, this.actor(r)), "辅助核算成员已更新");
  deleteMember = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.deleteMember(r.params.id, this.actor(r)); return sendSuccess(p, null, "辅助核算成员已删除"); };
  upsertRule = async (r: FastifyRequest<{ Body: DimensionRuleInput }>, p: FastifyReply) => sendSuccess(p, await this.service.upsertRule(r.body, this.actor(r)), "科目辅助核算规则已保存");
  deleteRule = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.deleteRule(r.params.id, this.actor(r)); return sendSuccess(p, null, "科目辅助核算规则已删除"); };
  private actor(r: FastifyRequest): DimensionActor { return { actorId: Number(r.user.sub), role: r.user.role }; }
}
