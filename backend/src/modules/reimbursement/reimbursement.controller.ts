import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { ReimbursementService } from "./reimbursement.service.js";
import type {
  AvailableInvoiceFilter,
  ReimbursementInput,
  ReimbursementListFilter,
  ReimbursementPaymentInput,
  ReimbursementRejectInput,
} from "./reimbursement.types.js";

export class ReimbursementController {
  constructor(private readonly service: ReimbursementService) {}

  list = async (request: FastifyRequest<{ Querystring: ReimbursementListFilter }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.list(request.query));

  summary = async (_request: FastifyRequest, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.summary());

  availableInvoices = async (request: FastifyRequest<{ Querystring: AvailableInvoiceFilter }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.availableInvoices(request.query));

  availableBankTransactions = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.availableBankTransactions(request.params.id));

  get = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.get(request.params.id));

  create = async (request: FastifyRequest<{ Body: ReimbursementInput }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.create(request.body, this.actor(request)), "报销单已创建", 201);

  update = async (request: FastifyRequest<{ Params: { id: number }; Body: Partial<ReimbursementInput> }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.update(request.params.id, request.body, this.actor(request)), "报销单已更新");

  remove = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) => {
    await this.service.remove(request.params.id, this.actor(request));
    return sendSuccess(reply, null, "报销单已删除");
  };

  submit = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.submit(request.params.id, this.actor(request)), "报销单已提交审批");

  approve = async (request: FastifyRequest<{ Params: { id: number } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.approve(request.params.id, this.actor(request)), "报销单已审批通过");

  reject = async (request: FastifyRequest<{ Params: { id: number }; Body: ReimbursementRejectInput }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.reject(request.params.id, request.body, this.actor(request)), "报销单已驳回");

  pay = async (request: FastifyRequest<{ Params: { id: number }; Body: ReimbursementPaymentInput }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.pay(request.params.id, request.body, this.actor(request)), "报销已付款，凭证已记账");

  cancelPayment = async (request: FastifyRequest<{ Params: { id: number }; Body: { reason: string } }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.cancelPayment(request.params.id, request.body.reason, this.actor(request)), "报销付款已撤销");

  private actor(request: FastifyRequest) {
    return { actorId: Number(request.user.sub), role: request.user.role };
  }
}
