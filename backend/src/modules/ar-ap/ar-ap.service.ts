import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import { AR_AP_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import { getNextVoucherNumber } from "../voucher/voucher-numbering.helper.js";
import type { ArApActor, ArApDocumentKind, ArApPartyKind, DocumentInput, FollowUpInput, PartyInput, SettlementInput } from "./ar-ap.types.js";

const ZERO = new Prisma.Decimal(0);

export class ArApService {
  constructor(private readonly prisma: PrismaClient, private readonly periods: AccountingPeriodResolver) {}

  async listParties(kind: ArApPartyKind, keyword?: string) {
    const where = { deletedAt: null, ...(keyword ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } : {}) };
    return kind === "customer" ? this.prisma.customer.findMany({ where, orderBy: { code: "asc" } }) : this.prisma.supplier.findMany({ where, orderBy: { code: "asc" } });
  }

  createParty(kind: ArApPartyKind, input: PartyInput, actor: ArApActor) {
    this.assertParty(input);
    const creditLimit = this.creditLimit(input.creditLimit);
    const data = this.partyData(input, creditLimit);
    return this.prisma.$transaction(async tx => {
      const row = kind === "customer"
        ? await tx.customer.create({ data: { ...data, createdAt: new Date() } as Prisma.CustomerUncheckedCreateInput })
        : await tx.supplier.create({ data: { ...data, createdAt: new Date() } as Prisma.SupplierUncheckedCreateInput });
      await this.audit(tx, actor.actorId, "CREATE", kind === "customer" ? "Customer" : "Supplier", row.id, null, { code: row.code, name: row.name, creditLimit: row.creditLimit.toString() });
      return row;
    });
  }

  async updateParty(kind: ArApPartyKind, id: number, input: Partial<PartyInput>, actor: ArApActor) {
    const current = await this.requireParty(kind, id);
    if (input.code !== undefined || input.name !== undefined) this.assertParty({ code: input.code ?? "KEEP", name: input.name ?? "KEEP" });
    const data = this.partyData(input, input.creditLimit !== undefined ? this.creditLimit(input.creditLimit) : undefined);
    return this.prisma.$transaction(async tx => {
      const row = kind === "customer" ? await tx.customer.update({ where: { id }, data }) : await tx.supplier.update({ where: { id }, data });
      await this.audit(tx, actor.actorId, "UPDATE", kind === "customer" ? "Customer" : "Supplier", id, { code: current.code, name: current.name, creditLimit: current.creditLimit.toString() }, { code: row.code, name: row.name, creditLimit: row.creditLimit.toString() });
      return row;
    });
  }

  async deleteParty(kind: ArApPartyKind, id: number, actor: ArApActor) {
    const party = await this.requireParty(kind, id);
    const count = kind === "customer"
      ? await this.prisma.receivable.count({ where: { customerId: id, deletedAt: null } })
      : await this.prisma.payable.count({ where: { supplierId: id, deletedAt: null } });
    if (count) throw new AppError("PARTY_IN_USE", "存在往来单据的客户或供应商不能删除", 409);
    await this.prisma.$transaction(async tx => {
      if (kind === "customer") await tx.customer.update({ where: { id: party.id }, data: { deletedAt: new Date(), enabled: false } });
      else await tx.supplier.update({ where: { id: party.id }, data: { deletedAt: new Date(), enabled: false } });
      await this.audit(tx, actor.actorId, "DELETE", kind === "customer" ? "Customer" : "Supplier", id, { code: party.code, name: party.name }, { deleted: true });
    });
  }

  async listDocuments(kind: ArApDocumentKind, partyId?: number, status?: string) {
    const numericStatus = status === undefined || status === "" ? undefined : Number(status);
    if (numericStatus !== undefined && (!Number.isInteger(numericStatus) || numericStatus < AR_AP_STATUS.OPEN || numericStatus > AR_AP_STATUS.SETTLED)) throw new AppError("INVALID_AR_AP_STATUS", "Invalid AR/AP document status", 400);
    if (kind === "receivable") return this.prisma.receivable.findMany({ where: { deletedAt: null, ...(partyId ? { customerId: partyId } : {}), ...(numericStatus !== undefined ? { status: numericStatus } : {}) }, include: { customer: true, settlements: { where: { deletedAt: null }, orderBy: { paymentDate: "desc" } } }, orderBy: [{ dueDate: "asc" }, { occurrenceDate: "asc" }] });
    return this.prisma.payable.findMany({ where: { deletedAt: null, ...(partyId ? { supplierId: partyId } : {}), ...(numericStatus !== undefined ? { status: numericStatus } : {}) }, include: { supplier: true, settlements: { where: { deletedAt: null }, orderBy: { paymentDate: "desc" } } }, orderBy: [{ dueDate: "asc" }, { occurrenceDate: "asc" }] });
  }

  async createDocument(kind: ArApDocumentKind, input: DocumentInput, actor: ArApActor) {
    const amount = this.amount(input.amount);
    const occurrenceDate = this.date(input.occurrenceDate, "业务日期");
    const dueDate = input.dueDate ? this.date(input.dueDate, "到期日期") : null;
    if (dueDate && dueDate < occurrenceDate) throw new AppError("INVALID_DUE_DATE", "到期日期不能早于业务日期", 400);
    await this.requireParty(kind === "receivable" ? "customer" : "supplier", input.partyId);
    const profile = await this.prisma.companyProfile.findFirst({ where: { deletedAt: null }, select: { operationMode: true } });
    if (kind === "receivable" && profile?.operationMode === "STANDARD") {
      const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: input.partyId } });
      if (customer.creditLimit.greaterThan(0)) {
        const existing = (await this.balances("receivable")).find((row) => row.code === customer.code)?.outstanding ?? ZERO;
        if (existing.plus(amount).greaterThan(customer.creditLimit)) throw new AppError("CREDIT_LIMIT_EXCEEDED", "应收登记将超过客户信用额度", 409, { creditLimit: customer.creditLimit.toString(), outstanding: existing.toString() });
      }
    }
    const common = { documentNo: input.documentNo.trim(), occurrenceDate, dueDate, amount, currency: (input.currency ?? "CNY").toUpperCase(), description: input.description?.trim() || null, createdById: actor.actorId };
    if (common.currency !== "CNY") throw new AppError("AR_AP_CURRENCY_UNSUPPORTED", "当前往来核销仅支持人民币；外币业务需配置汇率后再启用", 400);
    if (!/^[A-Z]{3}$/.test(common.currency)) throw new AppError("INVALID_CURRENCY", "币种必须为三位代码", 400);
    if (!common.documentNo) throw new AppError("INVALID_DOCUMENT_NO", "往来单据编号不能为空", 400);
    if (kind === "receivable") return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${input.partyId} AND deleted_at IS NULL FOR UPDATE`;
      const liveProfile = await tx.companyProfile.findFirst({ where: { deletedAt: null }, select: { operationMode: true } });
      if (liveProfile?.operationMode === "STANDARD") {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.partyId } });
        if (customer.creditLimit.greaterThan(0)) {
          const totals = await tx.receivable.aggregate({ where: { customerId: input.partyId, deletedAt: null }, _sum: { amount: true, settledAmount: true } });
          const outstanding = (totals._sum.amount ?? ZERO).minus(totals._sum.settledAmount ?? ZERO);
          if (outstanding.plus(amount).greaterThan(customer.creditLimit)) throw new AppError("CREDIT_LIMIT_EXCEEDED", "应收登记将超过客户信用额度", 409, { creditLimit: customer.creditLimit.toString(), outstanding: outstanding.toString() });
        }
      }
      const row = await tx.receivable.create({ data: { ...common, customerId: input.partyId } });
      await this.audit(tx, actor.actorId, "CREATE", "Receivable", row.id, null, { documentNo: row.documentNo, amount: row.amount.toString() });
      return row;
    });
    return this.prisma.$transaction(async tx => {
      const row = await tx.payable.create({ data: { ...common, supplierId: input.partyId } });
      await this.audit(tx, actor.actorId, "CREATE", "Payable", row.id, null, { documentNo: row.documentNo, amount: row.amount.toString() });
      return row;
    });
  }

  async settle(kind: ArApDocumentKind, id: number, input: SettlementInput, actor: ArApActor) {
    const amount = this.amount(input.amount);
    const paymentDate = this.date(input.paymentDate, "收付款日期");
    const period = await this.periods.resolveOpenPeriod(paymentDate);
    if (input.bankAccountId === input.settlementAccountId) throw new AppError("INVALID_SETTLEMENT_ACCOUNTS", "银行科目与往来科目不能相同", 400);
    return this.prisma.$transaction(async tx => {
      if (kind === "receivable") await tx.$queryRaw`SELECT id FROM receivables WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM payables WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const document = kind === "receivable"
        ? await tx.receivable.findFirst({ where: { id, deletedAt: null }, include: { customer: true } })
        : await tx.payable.findFirst({ where: { id, deletedAt: null }, include: { supplier: true } });
      if (!document) throw new AppError("AR_AP_DOCUMENT_NOT_FOUND", "往来单据不存在", 404);
      const outstanding = document.amount.minus(document.settledAmount);
      if (document.status === AR_AP_STATUS.SETTLED || outstanding.lessThan(amount)) throw new AppError("SETTLEMENT_EXCEEDS_BALANCE", "收付款金额超过未核销余额", 409, { outstanding: outstanding.toString() });
      await this.validateAccounts(tx, input.bankAccountId, input.settlementAccountId);
      let bankRemaining = ZERO;
      if (input.bankTransactionId) {
        if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} AND deleted_at IS NULL FOR UPDATE`;
        const bankRow = await tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, deletedAt: null, reimbursementPayment: null, taxPayment: null } });
        const profile = await tx.companyProfile.findFirst({ where: { deletedAt: null }, select: { bankAccount: true } });
        const bankFlow = bankRow ? this.bankDirection(bankRow, profile?.bankAccount) : null;
        const bank = bankRow ? { ...bankRow, amount: bankRow.amount.abs() } : null;
        if (!bank) throw new AppError("BANK_TRANSACTION_NOT_FOUND", "银行流水不存在", 404);
        if (bank.voucherId) throw new AppError("BANK_TRANSACTION_ALREADY_MATCHED", "该银行流水已完成核销", 409);
        const expectedDirection = kind === "receivable" ? "INFLOW" : "OUTFLOW";
        if (bankFlow !== expectedDirection) throw new AppError("BANK_DIRECTION_MISMATCH", kind === "receivable" ? "收款只能匹配银行流入" : "付款只能匹配银行流出", 409);
        const [rcSettled, pySettled] = await Promise.all([
          tx.receivableSettlement.aggregate({ where: { bankTransactionId: input.bankTransactionId, status: { not: VOUCHER_STATUS.VOID } }, _sum: { amount: true } }),
          tx.payableSettlement.aggregate({ where: { bankTransactionId: input.bankTransactionId, status: { not: VOUCHER_STATUS.VOID } }, _sum: { amount: true } }),
        ]);
        const alreadySettled = (rcSettled._sum.amount ?? ZERO).plus(pySettled._sum.amount ?? ZERO);
        bankRemaining = bank.amount.minus(alreadySettled);
        if (bankRemaining.lessThan(amount)) {
          throw new AppError("BANK_AMOUNT_MISMATCH", `银行流水剩余可用金额（${bankRemaining.toString()}）小于本次核销金额（${amount.toString()}）`, 409, { remaining: bankRemaining.toString() });
        }
      }
      const sequence = await getNextVoucherNumber(tx, period.year);
      const partyName = "customer" in document ? document.customer.name : document.supplier.name;
      const summary = `${kind === "receivable" ? "收款核销" : "付款核销"}：${partyName} ${document.documentNo}`;
      const voucher = await tx.voucher.create({ data: {
        ...sequence, fiscalYear: period.year, fiscalPeriod: period.month, voucherDate: paymentDate, postingDate: paymentDate, periodId: period.id,
        summary, sourceType: "MANUAL", category: kind === "receivable" ? "RECEIPT" : "PAYMENT", status: VOUCHER_STATUS.POSTED, totalDebit: amount, totalCredit: amount,
        createdById: actor.actorId, reviewerId: actor.actorId, reviewedAt: new Date(), postedById: actor.actorId, postedAt: new Date(),
        entries: { create: kind === "receivable" ? [
          { lineNo: 1, accountId: input.bankAccountId, summary, debitAmount: amount, creditAmount: ZERO },
          { lineNo: 2, accountId: input.settlementAccountId, summary, debitAmount: ZERO, creditAmount: amount },
        ] : [
          { lineNo: 1, accountId: input.settlementAccountId, summary, debitAmount: amount, creditAmount: ZERO },
          { lineNo: 2, accountId: input.bankAccountId, summary, debitAmount: ZERO, creditAmount: amount },
        ] },
      } });
      const event = await tx.accountingEvent.create({ data: { eventType: kind === "receivable" ? "RECEIPT" : "PAYMENT", sourceType: kind === "receivable" ? "ReceivableSettlement" : "PayableSettlement", sourceId: id, voucherId: voucher.id, description: summary, createdById: actor.actorId } });
      if (input.bankTransactionId && bankRemaining.minus(amount).isZero()) {
        await tx.bankTransaction.update({ where: { id: input.bankTransactionId }, data: { voucherId: voucher.id } });
      }
      const settledAmount = document.settledAmount.plus(amount);
      const status = settledAmount.equals(document.amount) ? AR_AP_STATUS.SETTLED : AR_AP_STATUS.PARTIAL;
      const settlementData = { paymentDate, amount, bankTransactionId: input.bankTransactionId ?? null, remark: input.remark?.trim() || null, eventId: event.id, voucherId: voucher.id, createdById: actor.actorId };
      if (kind === "receivable") {
        const row = await tx.receivableSettlement.create({ data: { ...settlementData, receiptNo: `RC-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, receivableId: id } });
        await tx.receivable.update({ where: { id }, data: { settledAmount, status } });
        await this.audit(tx, actor.actorId, "UPDATE", "Receivable", id, { status: document.status, settledAmount: document.settledAmount.toString() }, { status, settledAmount: settledAmount.toString(), settlementId: row.id });
        return row;
      }
      const row = await tx.payableSettlement.create({ data: { ...settlementData, paymentNo: `PY-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, payableId: id } });
      await tx.payable.update({ where: { id }, data: { settledAmount, status } });
      await this.audit(tx, actor.actorId, "UPDATE", "Payable", id, { status: document.status, settledAmount: document.settledAmount.toString() }, { status, settledAmount: settledAmount.toString(), settlementId: row.id });
      return row;
    });
  }

  async bankMatches(kind: ArApDocumentKind, id: number) {
    const document = kind === "receivable" ? await this.prisma.receivable.findFirst({ where: { id, deletedAt: null }, include: { customer: true } }) : await this.prisma.payable.findFirst({ where: { id, deletedAt: null }, include: { supplier: true } });
    if (!document) throw new AppError("AR_AP_DOCUMENT_NOT_FOUND", "往来单据不存在", 404);
    const name = "customer" in document ? document.customer.name : document.supplier.name;
    const amount = document.amount.minus(document.settledAmount);
    const [rows, profile] = await Promise.all([
      this.prisma.bankTransaction.findMany({ where: { deletedAt: null, voucherId: null, amount: { in: [amount, amount.negated()] }, OR: [{ payerName: { contains: name } }, { payeeName: { contains: name } }] }, orderBy: { transactionDate: "desc" }, take: 20 }),
      this.prisma.companyProfile.findFirst({ where: { deletedAt: null }, select: { bankAccount: true } }),
    ]);
    const expectedDirection = kind === "receivable" ? "INFLOW" : "OUTFLOW";
    return { outstanding: amount, matches: rows.filter(row => this.bankDirection(row, profile?.bankAccount) === expectedDirection) };
  }

  async cancelSettlement(kind: ArApDocumentKind, settlementId: number, reason: string, actor: ArApActor) {
    this.admin(actor);
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) throw new AppError("INVALID_VOID_REASON", "撤销原因不能为空且不能超过500字", 400);
    return this.prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === "function") {
        if (kind === "receivable") await tx.$queryRaw`SELECT id FROM receivable_settlements WHERE id = ${settlementId} AND deleted_at IS NULL FOR UPDATE`;
        else await tx.$queryRaw`SELECT id FROM payable_settlements WHERE id = ${settlementId} AND deleted_at IS NULL FOR UPDATE`;
      }
      const settlement = kind === "receivable"
        ? await tx.receivableSettlement.findFirst({ where: { id: settlementId, deletedAt: null }, include: { voucher: true } })
        : await tx.payableSettlement.findFirst({ where: { id: settlementId, deletedAt: null }, include: { voucher: true } });
      if (!settlement) throw new AppError("SETTLEMENT_NOT_FOUND", "核销记录不存在", 404);
      if (settlement.status !== VOUCHER_STATUS.POSTED) throw new AppError("SETTLEMENT_NOT_POSTED", "仅已记账核销可以撤销", 409);
      await this.periods.assertVoucherOperation(settlement.voucher.periodId);
      const voucher = await tx.voucher.updateMany({ where: { id: settlement.voucherId, status: VOUCHER_STATUS.POSTED, deletedAt: null }, data: { status: VOUCHER_STATUS.VOID, voidById: actor.actorId, voidAt: new Date(), voidReason: trimmed } });
      if (voucher.count !== 1) throw new AppError("SETTLEMENT_STATE_CONFLICT", "核销状态已发生变化", 409);
      if (settlement.bankTransactionId) await tx.bankTransaction.updateMany({ where: { id: settlement.bankTransactionId, voucherId: settlement.voucherId }, data: { voucherId: null } });
      if (kind === "receivable") {
        const row = await tx.receivableSettlement.findUniqueOrThrow({ where: { id: settlementId } });
        if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM receivables WHERE id = ${row.receivableId} AND deleted_at IS NULL FOR UPDATE`;
        const document = await tx.receivable.findUniqueOrThrow({ where: { id: row.receivableId } });
        const settledAmount = Prisma.Decimal.max(ZERO, document.settledAmount.minus(row.amount));
        const status = settledAmount.equals(0) ? AR_AP_STATUS.OPEN : settledAmount.equals(document.amount) ? AR_AP_STATUS.SETTLED : AR_AP_STATUS.PARTIAL;
        await tx.receivableSettlement.update({ where: { id: settlementId }, data: { status: VOUCHER_STATUS.VOID, bankTransactionId: null } });
        await tx.receivable.update({ where: { id: document.id }, data: { settledAmount, status } });
        await this.audit(tx, actor.actorId, "UPDATE", "ReceivableSettlement", settlementId, { status: VOUCHER_STATUS.POSTED }, { status: VOUCHER_STATUS.VOID, reason: trimmed });
        return tx.receivableSettlement.findUniqueOrThrow({ where: { id: settlementId }, include: { voucher: true } });
      }
      const row = await tx.payableSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM payables WHERE id = ${row.payableId} AND deleted_at IS NULL FOR UPDATE`;
      const document = await tx.payable.findUniqueOrThrow({ where: { id: row.payableId } });
      const settledAmount = Prisma.Decimal.max(ZERO, document.settledAmount.minus(row.amount));
      const status = settledAmount.equals(0) ? AR_AP_STATUS.OPEN : settledAmount.equals(document.amount) ? AR_AP_STATUS.SETTLED : AR_AP_STATUS.PARTIAL;
      await tx.payableSettlement.update({ where: { id: settlementId }, data: { status: VOUCHER_STATUS.VOID, bankTransactionId: null } });
      await tx.payable.update({ where: { id: document.id }, data: { settledAmount, status } });
      await this.audit(tx, actor.actorId, "UPDATE", "PayableSettlement", settlementId, { status: VOUCHER_STATUS.POSTED }, { status: VOUCHER_STATUS.VOID, reason: trimmed });
      return tx.payableSettlement.findUniqueOrThrow({ where: { id: settlementId }, include: { voucher: true } });
    });
  }

  async balances(kind: ArApDocumentKind) {
    const rows = await this.listDocuments(kind);
    const map = new Map<number, { code: string; name: string; creditLimit: Prisma.Decimal; amount: Prisma.Decimal; settled: Prisma.Decimal; outstanding: Prisma.Decimal }>();
    for (const row of rows) { const party = "customer" in row ? row.customer : row.supplier; const current = map.get(party.id) ?? { code: party.code, name: party.name, creditLimit: party.creditLimit, amount: ZERO, settled: ZERO, outstanding: ZERO }; current.amount = current.amount.plus(row.amount); current.settled = current.settled.plus(row.settledAmount); current.outstanding = current.outstanding.plus(row.amount.minus(row.settledAmount)); map.set(party.id, current); }
    return [...map.values()].sort((a, b) => b.outstanding.comparedTo(a.outstanding));
  }

  async summary(kind: ArApDocumentKind) {
    const rows = await this.listDocuments(kind);
    const totals = rows.reduce((current, row) => ({
      amount: current.amount.plus(row.amount), settled: current.settled.plus(row.settledAmount), outstanding: current.outstanding.plus(row.amount.minus(row.settledAmount)), openCount: current.openCount + (row.status === AR_AP_STATUS.SETTLED ? 0 : 1),
    }), { amount: ZERO, settled: ZERO, outstanding: ZERO, openCount: 0 });
    return { documentCount: rows.length, ...totals };
  }

  async aging(kind: ArApDocumentKind, asOf = new Date()) {
    const rows = await this.listDocuments(kind, undefined, undefined);
    return rows.map(row => { const remaining = row.amount.minus(row.settledAmount); const due = row.dueDate ?? row.occurrenceDate; const days = Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / 86_400_000)); const party = "customer" in row ? row.customer.name : row.supplier.name; return { id: row.id, documentNo: row.documentNo, party, dueDate: row.dueDate, outstanding: remaining, daysOverdue: days, bucket: days === 0 ? "CURRENT" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+" }; }).filter(row => row.outstanding.greaterThan(0));
  }

  async listFollowUps(query: { status?: number; due?: "today" | "overdue" | "all" } = {}) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const due = query.due === "overdue" ? { lt: today } : query.due === "today" ? { equals: today } : undefined;
    return this.prisma.arApFollowUp.findMany({ where: { deletedAt: null, ...(query.status !== undefined ? { status: query.status } : {}), ...(due ? { scheduledDate: due } : {}) }, include: { customer: true, supplier: true, createdBy: { select: { id: true, displayName: true } } }, orderBy: [{ status: "asc" }, { scheduledDate: "asc" }] });
  }

  async createFollowUp(input: FollowUpInput, actor: ArApActor) {
    if ((input.customerId ? 1 : 0) + (input.supplierId ? 1 : 0) !== 1) throw new AppError("INVALID_FOLLOW_UP_PARTY", "跟进任务必须绑定一个客户或供应商", 400);
    const content = input.content.trim(); if (!content) throw new AppError("INVALID_FOLLOW_UP", "跟进内容不能为空", 400);
    const date = this.date(input.scheduledDate, "跟进日期");
    if (input.customerId) await this.requireParty("customer", input.customerId);
    if (input.supplierId) await this.requireParty("supplier", input.supplierId);
    return this.prisma.$transaction(async tx => {
      const row = await tx.arApFollowUp.create({ data: { customerId: input.customerId ?? null, supplierId: input.supplierId ?? null, sourceType: input.sourceType?.trim() || null, sourceId: input.sourceId ?? null, scheduledDate: date, content, result: input.result?.trim() || null, createdById: actor.actorId } });
      await this.audit(tx, actor.actorId, "CREATE", "ArApFollowUp", row.id, null, { scheduledDate: input.scheduledDate, content });
      return row;
    });
  }

  async completeFollowUp(id: number, result: string, actor: ArApActor) {
    const current = await this.prisma.arApFollowUp.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("FOLLOW_UP_NOT_FOUND", "跟进任务不存在", 404);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM ar_ap_follow_ups WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const locked = await tx.arApFollowUp.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
      if (!locked) throw new AppError("FOLLOW_UP_NOT_FOUND", "Follow-up not found", 404);
      if (locked.status === 1) throw new AppError("FOLLOW_UP_ALREADY_COMPLETED", "Follow-up is already completed", 409);
      const row = await tx.arApFollowUp.update({ where: { id }, data: { status: 1, result: result.trim() || null, completedAt: new Date(), completedById: actor.actorId } });
      await this.audit(tx, actor.actorId, "UPDATE", "ArApFollowUp", id, { status: current.status }, { status: row.status, result: row.result });
      return row;
    });
  }

  private partyData(input: Partial<PartyInput>, creditLimit?: Prisma.Decimal) {
    const data: Record<string, unknown> = {};
    for (const key of ["code", "name", "taxId", "contact", "phone", "address", "remark"] as const) {
      if (input[key] !== undefined) data[key] = input[key]?.trim() || null;
    }
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (creditLimit !== undefined) data.creditLimit = creditLimit;
    return data;
  }

  private creditLimit(value?: string) {
    if (value === undefined || value === "") return ZERO;
    const amount = new Prisma.Decimal(value);
    if (amount.lessThan(0)) throw new AppError("INVALID_CREDIT_LIMIT", "信用额度不能为负数", 400);
    return amount;
  }

  private async requireParty(kind: ArApPartyKind, id: number) { const row = kind === "customer" ? await this.prisma.customer.findFirst({ where: { id, deletedAt: null, enabled: true } }) : await this.prisma.supplier.findFirst({ where: { id, deletedAt: null, enabled: true } }); if (!row) throw new AppError("AR_AP_PARTY_NOT_FOUND", "客户或供应商不存在或已停用", 404); return row; }
  private assertParty(input: Pick<PartyInput, "code" | "name">) { if (!input.code.trim() || !input.name.trim()) throw new AppError("INVALID_PARTY", "客户或供应商编码、名称不能为空", 400); }
  private amount(value: string) { if (!/^\d{1,15}(\.\d{1,4})?$/.test(value) || new Prisma.Decimal(value).lessThanOrEqualTo(0)) throw new AppError("INVALID_AMOUNT", "金额必须为大于零且最多四位小数的数值", 400); return new Prisma.Decimal(value); }
  private date(value: string, field: string) { const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime())) throw new AppError("INVALID_DATE", `${field}无效`, 400); return date; }
  private async validateAccounts(tx: Prisma.TransactionClient, ...ids: number[]) { const accounts = await tx.account.findMany({ where: { id: { in: ids }, deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true } }); if (accounts.length !== new Set(ids).size) throw new AppError("ACCOUNT_NOT_POSTABLE", "收付款科目不存在、未启用或不是末级科目", 400); }
  private bankDirection(item: { amount: Prisma.Decimal; payerAccount: string | null; payeeAccount: string | null; reconciliationDirection?: string | null }, companyBankAccount?: string | null) {
    if (item.reconciliationDirection === "INFLOW" || item.reconciliationDirection === "OUTFLOW") return item.reconciliationDirection;
    const normalize = (value?: string | null) => value?.replace(/\D/g, "") ?? "";
    const own = normalize(companyBankAccount); const payer = normalize(item.payerAccount); const payee = normalize(item.payeeAccount);
    if (own && payer === own && payee !== own) return "OUTFLOW" as const;
    if (own && payee === own && payer !== own) return "INFLOW" as const;
    return item.amount.isNegative() ? "OUTFLOW" as const : "INFLOW" as const;
  }
  private audit(tx: Prisma.TransactionClient, actorId: number, action: "CREATE" | "UPDATE" | "DELETE", resourceType: string, resourceId: number, beforeData: object | null, afterData: object) { return tx.auditLog.create({ data: { actorId, action, resourceType, resourceId, beforeData: beforeData ?? Prisma.JsonNull, afterData } }); }
  private admin(actor: ArApActor) { if (canManageAccounting(actor.role)) return; throw new AppError("FORBIDDEN", "仅财务主管可以撤销往来核销", 403); }
}

