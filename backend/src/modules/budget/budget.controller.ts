import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { BudgetService } from "./budget.service.js";
import type { BudgetActor, BudgetLineInput, BudgetPlanInput } from "./budget.types.js";

export class BudgetController {
  constructor(private readonly service: BudgetService) {}
  list = async (r: FastifyRequest<{ Querystring: { fiscalYear?: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.list(r.query.fiscalYear));
  createPlan = async (r: FastifyRequest<{ Body: BudgetPlanInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createPlan(r.body, this.actor(r)), "预算计划已创建", 201);
  updatePlan = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<BudgetPlanInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updatePlan(r.params.id, r.body, this.actor(r)), "预算计划已更新");
  addLine = async (r: FastifyRequest<{ Params: { id: number }; Body: BudgetLineInput }>, p: FastifyReply) => sendSuccess(p, await this.service.addLine(r.params.id, r.body, this.actor(r)), "预算额度已添加", 201);
  updateLine = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<BudgetLineInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateLine(r.params.id, r.body, this.actor(r)), "预算额度已更新");
  deleteLine = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.deleteLine(r.params.id, this.actor(r)); return sendSuccess(p, null, "预算额度已删除"); };
  private actor(r: FastifyRequest): BudgetActor { return { actorId: Number(r.user.sub), role: r.user.role }; }
}
