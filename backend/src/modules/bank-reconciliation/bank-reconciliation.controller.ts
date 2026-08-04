import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { BankReconciliationService } from "./bank-reconciliation.service.js";
import type { BankMatchInput, BankReconciliationInput, BankReconciliationUpdateInput, BankTransactionDirection } from "./bank-reconciliation.types.js";

export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}
  list = async (r: FastifyRequest<{ Querystring: { periodId?: number; bankAccountId?: number; status?: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.list(r.query));
  create = async (r: FastifyRequest<{ Body: BankReconciliationInput }>, p: FastifyReply) => sendSuccess(p, await this.service.create(r.body, this.actor(r)), "银行对账单已建立", 201);
  update = async (r: FastifyRequest<{ Params: { id: number }; Body: BankReconciliationUpdateInput }>, p: FastifyReply) => sendSuccess(p, await this.service.update(r.params.id, r.body, this.actor(r)), "银行对账单已更新");
  detail = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.detail(r.params.id));
  match = async (r: FastifyRequest<{ Params: { id: number }; Body: BankMatchInput }>, p: FastifyReply) => sendSuccess(p, await this.service.match(r.params.id, r.body, this.actor(r)), "匹配成功", 201);
  confirmDirection = async (r: FastifyRequest<{ Params: { id: number; transactionId: number }; Body: { direction: BankTransactionDirection } }>, p: FastifyReply) => sendSuccess(p, await this.service.confirmTransactionDirection(r.params.id, r.params.transactionId, r.body.direction, this.actor(r)), "流水方向已确认");
  unmatch = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.unmatch(r.params.id, this.actor(r)); return sendSuccess(p, null, "匹配已解除"); };
  autoMatch = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.autoMatch(r.params.id, this.actor(r)), "自动匹配完成");
  complete = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.complete(r.params.id, this.actor(r)), "银行对账已完成");
  reopen = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => sendSuccess(p, await this.service.reopen(r.params.id, this.actor(r)), "银行对账已重新打开");
  private actor(r: FastifyRequest) { return { actorId: Number(r.user.sub), role: r.user.role }; }
}
