import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { TaxPeriodQuery } from "./dto/tax.dto.js";
import type { TaxService } from "./tax.service.js";

interface DeclarationBody extends TaxPeriodQuery { taxType: "VAT" | "SURCHARGE" | "CORPORATE_INCOME" }
interface DeclarationParams { id: number }

export class TaxController {
  constructor(private readonly service: TaxService) {}
  input = async (request: FastifyRequest<{ Querystring: TaxPeriodQuery }>, reply: FastifyReply) => sendSuccess(reply, await this.service.inputLedger(request.query));
  output = async (request: FastifyRequest<{ Querystring: TaxPeriodQuery }>, reply: FastifyReply) => sendSuccess(reply, await this.service.outputLedger(request.query));
  foundation = async (request: FastifyRequest<{ Querystring: TaxPeriodQuery }>, reply: FastifyReply) => sendSuccess(reply, await this.service.foundation(request.query));
  listDeclarations = async (request: FastifyRequest<{ Querystring: Partial<TaxPeriodQuery> }>, reply: FastifyReply) => sendSuccess(reply, await this.service.listDeclarations(request.query));
  declaration = async (request: FastifyRequest<{ Params: DeclarationParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.getDeclaration(request.params.id));
  prepare = async (request: FastifyRequest<{ Body: DeclarationBody }>, reply: FastifyReply) => sendSuccess(reply, await this.service.prepare(request.body.taxType, request.body, Number(request.user.sub)), "税务申报底稿已生成", 201);
  updateLines = async (request: FastifyRequest<{ Params: DeclarationParams; Body: { lines: Array<{ lineCode: string; adjustmentAmount: string; remark?: string }> } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.updateLines(request.params.id, request.body.lines, Number(request.user.sub)), "税务调整已保存");
  review = async (request: FastifyRequest<{ Params: DeclarationParams }>, reply: FastifyReply) => sendSuccess(reply, await this.service.review(request.params.id, Number(request.user.sub)), "税务申报底稿已复核");
  declare = async (request: FastifyRequest<{ Params: DeclarationParams; Body: { declarationNo: string } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.declare(request.params.id, request.body.declarationNo, Number(request.user.sub)), "税务申报已登记");
  pay = async (request: FastifyRequest<{ Params: DeclarationParams; Body: { amount: string; paymentDate: string; paymentReference?: string; bankTransactionId?: number } }>, reply: FastifyReply) => sendSuccess(reply, await this.service.pay(request.params.id, request.body, Number(request.user.sub)), "税款缴纳已登记");
}
