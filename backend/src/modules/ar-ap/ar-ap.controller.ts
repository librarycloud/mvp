import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { ArApService } from "./ar-ap.service.js";
import type { ArApDocumentKind, ArApPartyKind, DocumentInput, FollowUpInput, PartyInput, SettlementInput } from "./ar-ap.types.js";

export class ArApController {
  constructor(private readonly service: ArApService) {}
  listCustomers = async (r: FastifyRequest<{ Querystring: { keyword?: string } }>, p: FastifyReply) => sendSuccess(p, await this.service.listParties("customer", r.query.keyword));
  listSuppliers = async (r: FastifyRequest<{ Querystring: { keyword?: string } }>, p: FastifyReply) => sendSuccess(p, await this.service.listParties("supplier", r.query.keyword));
  createCustomer = async (r: FastifyRequest<{ Body: PartyInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createParty("customer", r.body, { actorId: Number(r.user.sub), role: r.user.role }), "客户创建成功", 201);
  createSupplier = async (r: FastifyRequest<{ Body: PartyInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createParty("supplier", r.body, { actorId: Number(r.user.sub), role: r.user.role }), "供应商创建成功", 201);
  updateCustomer = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<PartyInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateParty("customer", r.params.id, r.body, { actorId: Number(r.user.sub), role: r.user.role }));
  updateSupplier = async (r: FastifyRequest<{ Params: { id: number }; Body: Partial<PartyInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateParty("supplier", r.params.id, r.body, { actorId: Number(r.user.sub), role: r.user.role }));
  deleteCustomer = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.deleteParty("customer", r.params.id, { actorId: Number(r.user.sub), role: r.user.role }); return sendSuccess(p, null, "客户已删除"); };
  deleteSupplier = async (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => { await this.service.deleteParty("supplier", r.params.id, { actorId: Number(r.user.sub), role: r.user.role }); return sendSuccess(p, null, "供应商已删除"); };
  listReceivables = (r: FastifyRequest<{ Querystring: { partyId?: number; status?: string } }>, p: FastifyReply) => this.documents("receivable", r, p);
  listPayables = (r: FastifyRequest<{ Querystring: { partyId?: number; status?: string } }>, p: FastifyReply) => this.documents("payable", r, p);
  createReceivable = (r: FastifyRequest<{ Body: DocumentInput }>, p: FastifyReply) => this.createDocument("receivable", r, p);
  createPayable = (r: FastifyRequest<{ Body: DocumentInput }>, p: FastifyReply) => this.createDocument("payable", r, p);
  receipt = (r: FastifyRequest<{ Params: { id: number }; Body: SettlementInput }>, p: FastifyReply) => this.settle("receivable", r, p);
  payment = (r: FastifyRequest<{ Params: { id: number }; Body: SettlementInput }>, p: FastifyReply) => this.settle("payable", r, p);
  cancelReceipt = (r: FastifyRequest<{ Params: { id: number }; Body: { reason: string } }>, p: FastifyReply) => this.cancelSettlement("receivable", r, p);
  cancelPayment = (r: FastifyRequest<{ Params: { id: number }; Body: { reason: string } }>, p: FastifyReply) => this.cancelSettlement("payable", r, p);
  receivableWriteOff = (r: FastifyRequest<{ Params: { id: number }; Body: SettlementInput }>, p: FastifyReply) => this.settle("receivable", r, p);
  payableWriteOff = (r: FastifyRequest<{ Params: { id: number }; Body: SettlementInput }>, p: FastifyReply) => this.settle("payable", r, p);
  receivableMatches = (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => this.matches("receivable", r, p);
  payableMatches = (r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) => this.matches("payable", r, p);
  receivableBalances = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.balances("receivable"));
  payableBalances = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.balances("payable"));
  receivableSummary = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.summary("receivable"));
  payableSummary = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.summary("payable"));
  receivableAging = (r: FastifyRequest<{ Querystring: { asOf?: string } }>, p: FastifyReply) => this.aging("receivable", r, p);
  payableAging = (r: FastifyRequest<{ Querystring: { asOf?: string } }>, p: FastifyReply) => this.aging("payable", r, p);
  followUps = async (r: FastifyRequest<{ Querystring: { status?: number; due?: "today" | "overdue" | "all" } }>, p: FastifyReply) => sendSuccess(p, await this.service.listFollowUps(r.query));
  createFollowUp = async (r: FastifyRequest<{ Body: FollowUpInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createFollowUp(r.body, { actorId: Number(r.user.sub), role: r.user.role }), "跟进任务已创建", 201);
  completeFollowUp = async (r: FastifyRequest<{ Params: { id: number }; Body: { result: string } }>, p: FastifyReply) => sendSuccess(p, await this.service.completeFollowUp(r.params.id, r.body.result, { actorId: Number(r.user.sub), role: r.user.role }), "跟进任务已完成");
  private async documents(kind: ArApDocumentKind, r: FastifyRequest<{ Querystring: { partyId?: number; status?: string } }>, p: FastifyReply) { return sendSuccess(p, await this.service.listDocuments(kind, r.query.partyId, r.query.status)); }
  private async createDocument(kind: ArApDocumentKind, r: FastifyRequest<{ Body: DocumentInput }>, p: FastifyReply) { return sendSuccess(p, await this.service.createDocument(kind, r.body, { actorId: Number(r.user.sub), role: r.user.role }), kind === "receivable" ? "应收登记成功" : "应付登记成功", 201); }
  private async settle(kind: ArApDocumentKind, r: FastifyRequest<{ Params: { id: number }; Body: SettlementInput }>, p: FastifyReply) { return sendSuccess(p, await this.service.settle(kind, r.params.id, r.body, { actorId: Number(r.user.sub), role: r.user.role }), kind === "receivable" ? "收款核销成功，凭证已记账" : "付款核销成功，凭证已记账", 201); }
  private async cancelSettlement(kind: ArApDocumentKind, r: FastifyRequest<{ Params: { id: number }; Body: { reason: string } }>, p: FastifyReply) { return sendSuccess(p, await this.service.cancelSettlement(kind, r.params.id, r.body.reason, { actorId: Number(r.user.sub), role: r.user.role }), kind === "receivable" ? "收款核销已撤销" : "付款核销已撤销"); }
  private async matches(kind: ArApDocumentKind, r: FastifyRequest<{ Params: { id: number } }>, p: FastifyReply) { return sendSuccess(p, await this.service.bankMatches(kind, r.params.id)); }
  private async aging(kind: ArApDocumentKind, r: FastifyRequest<{ Querystring: { asOf?: string } }>, p: FastifyReply) { return sendSuccess(p, await this.service.aging(kind, r.query.asOf ? new Date(`${r.query.asOf}T00:00:00.000Z`) : new Date())); }
}
