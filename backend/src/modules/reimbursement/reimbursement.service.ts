import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canManageAccounting, canOperateCash } from "../../common/auth/authorization.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import type {
  AvailableInvoiceFilter,
  ReimbursementActor,
  ReimbursementInput,
  ReimbursementListFilter,
  ReimbursementPaymentInput,
  ReimbursementRejectInput,
} from "./reimbursement.types.js";
import { BudgetService } from "../budget/budget.service.js";

const ZERO = new Prisma.Decimal(0);
type Transaction = Prisma.TransactionClient;
const STATUS = { DRAFT: 0, PENDING: 1, APPROVED: 2, REJECTED: 3, PAID: 4 } as const;
const TAX_DEDUCTION_STATUS = { UNCONFIRMED: 0, DEDUCTIBLE: 1, NON_DEDUCTIBLE: 2, PARTIAL: 3 } as const;
const EVIDENCE_TYPE = { INVOICE: 0, OTHER: 1, NO_INVOICE: 2 } as const;
const EXPENSE_TYPE_DICTIONARY = "reimbursement_expense_type";
type ReimbursementData = {
  applicantName?: string;
  department?: string | null;
  expenseDate?: Date;
  expenseType?: string;
  amount?: Prisma.Decimal;
  currency?: string;
  description?: string | null;
  evidenceType?: number;
  evidenceDescription?: string | null;
};

const includeDetail = {
  invoices: { where: { deletedAt: null }, orderBy: [{ issueTime: "asc" as const }, { invoiceNumber: "asc" as const }] },
  voucher: true,
  expenseAccount: true,
  paymentAccount: true,
  inputTaxAccount: true,
  bankTransaction: true,
  budgetReservation: { include: { budgetLine: { include: { plan: true } } } },
  createdBy: { select: { id: true, displayName: true, username: true } },
  approvedBy: { select: { id: true, displayName: true, username: true } },
  rejectedBy: { select: { id: true, displayName: true, username: true } },
  paidBy: { select: { id: true, displayName: true, username: true } },
};

export class ReimbursementService {
  private readonly budget: BudgetService;
  constructor(private readonly prisma: PrismaClient, private readonly periods: AccountingPeriodResolver, budget?: BudgetService) {
    this.budget = budget ?? new BudgetService(prisma);
  }

  async list(filter: ReimbursementListFilter = {}) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const where: Prisma.ReimbursementWhereInput = { deletedAt: null };
    if (filter.status) where.status = this.status(filter.status);
    if (filter.applicantName) where.applicantName = { contains: filter.applicantName };
    if (filter.dateFrom || filter.dateTo) {
      where.expenseDate = {
        ...(filter.dateFrom ? { gte: this.date(filter.dateFrom, "开始日期") } : {}),
        ...(filter.dateTo ? { lte: this.date(filter.dateTo, "结束日期") } : {}),
      };
    }
    if (filter.keyword) {
      where.OR = [
        { reimbursementNo: { contains: filter.keyword } },
        { applicantName: { contains: filter.keyword } },
        { department: { contains: filter.keyword } },
        { expenseType: { contains: filter.keyword } },
        { description: { contains: filter.keyword } },
        { invoices: { some: { deletedAt: null, OR: [{ invoiceNumber: { contains: filter.keyword } }, { sellerName: { contains: filter.keyword } }] } } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reimbursement.findMany({
        where,
        include: includeDetail,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reimbursement.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async summary() {
    const rows = await this.prisma.reimbursement.findMany({ where: { deletedAt: null }, select: { status: true, amount: true } });
    const totals: Record<string, number | Prisma.Decimal> = { amount: ZERO };
    for (const row of rows) {
      totals.amount = (totals.amount as Prisma.Decimal).plus(row.amount);
      totals[`status${row.status}`] = Number(totals[`status${row.status}`] ?? 0) + 1;
    }
    return { count: rows.length, ...totals };
  }

  availableInvoices(filter: AvailableInvoiceFilter = {}) {
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      direction: "PURCHASE",
      voucherId: null,
      OR: [
        { reimbursementId: null },
        ...(filter.reimbursementId
          ? [{ reimbursementId: filter.reimbursementId }]
          : []),
      ],
      ...(filter.keyword
        ? {
            AND: [{
              OR: [
                { invoiceNumber: { contains: filter.keyword } },
                { sellerName: { contains: filter.keyword } },
                { buyerName: { contains: filter.keyword } },
              ],
            }],
          }
        : {}),
    };
    return this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        issueTime: true,
        sellerName: true,
        sellerIdNum: true,
        buyerName: true,
        buyerIdNum: true,
        totalAmountWithoutTax: true,
        totalTaxAmount: true,
        totalTaxIncludedAmount: true,
        taxDeductionStatus: true,
        deductibleTaxAmount: true,
        currency: true,
      },
      orderBy: [{ issueTime: "desc" }, { invoiceNumber: "desc" }],
      take: 100,
    });
  }

  async availableBankTransactions(id: number) {
    const current = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    return this.prisma.bankTransaction.findMany({
      where: { deletedAt: null, voucherId: null, amount: { in: [current.amount, current.amount.negated()] }, reimbursementPayment: null },
      orderBy: [{ transactionDate: "desc" }, { transactionNo: "asc" }],
      take: 50,
    });
  }

  async get(id: number) {
    const row = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null }, include: includeDetail });
    if (!row) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    return row;
  }

  async create(input: ReimbursementInput, actor: ReimbursementActor) {
    const data = this.reimbursementData(input);
    return this.prisma.$transaction(async tx => {
      data.expenseType = await this.resolveExpenseType(tx, input.expenseType);
      const evidenceType = data.evidenceType ?? EVIDENCE_TYPE.INVOICE;
      const invoiceIds = input.invoiceIds ?? [];
      const treatmentInput = input.invoiceTaxTreatments ?? [];
      this.assertEvidenceSelection(evidenceType, data.evidenceDescription, invoiceIds, treatmentInput);
      const invoices = evidenceType === EVIDENCE_TYPE.INVOICE ? await this.resolveInvoices(tx, invoiceIds) : [];
      const taxTreatments = evidenceType === EVIDENCE_TYPE.INVOICE
        ? this.normalizeTaxTreatments(invoices, treatmentInput)
        : [];
      if (evidenceType === EVIDENCE_TYPE.INVOICE) this.assertInvoiceCoverage(data.amount!, invoices);
      const created = await tx.reimbursement.create({ data: { ...data, reimbursementNo: this.nextReimbursementNo(), createdById: actor.actorId } as Prisma.ReimbursementUncheckedCreateInput });
      if (invoices.length) {
        const reserved = await tx.invoice.updateMany({ where: { id: { in: invoices.map(row => row.id) }, reimbursementId: null, voucherId: null }, data: { reimbursementId: created.id } });
        if (reserved.count !== invoices.length) throw new AppError("REIMBURSEMENT_INVOICE_IN_USE", "部分发票刚刚被其他报销单使用，请刷新后重试", 409);
        await tx.invoiceUsage.createMany({ data: invoices.map((invoice) => ({ invoiceId: invoice.id, sourceType: "REIMBURSEMENT", sourceId: created.id, amount: invoice.totalTaxIncludedAmount, createdById: actor.actorId })) });
        await this.saveTaxTreatments(tx, taxTreatments);
      }
      const row = await tx.reimbursement.findUniqueOrThrow({ where: { id: created.id }, include: includeDetail });
      await this.audit(tx, actor.actorId, "CREATE", "Reimbursement", row.id, null, { reimbursementNo: row.reimbursementNo, amount: row.amount.toString(), invoiceCount: row.invoices.length });
      return row;
    });
  }

  async update(id: number, input: Partial<ReimbursementInput>, actor: ReimbursementActor) {
    const current = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null }, include: { invoices: { where: { deletedAt: null } } } });
    if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    this.assertOwnerOrAdmin(current.createdById, actor);
    if (current.status === STATUS.PAID) throw new AppError("REIMBURSEMENT_NOT_EDITABLE", "已付款报销单不能直接编辑，请先撤销付款", 409);
    const data = this.reimbursementData(input, true);
    const evidenceType = input.evidenceType ?? current.evidenceType;
    const evidenceDescription = input.evidenceDescription !== undefined
      ? input.evidenceDescription.trim() || null
      : current.evidenceDescription;
    const invoiceIds = evidenceType === EVIDENCE_TYPE.INVOICE
      ? input.invoiceIds ?? current.invoices.map(row => row.id)
      : input.invoiceIds ?? [];
    const treatmentInput = input.invoiceTaxTreatments ?? [];
    this.assertEvidenceSelection(evidenceType, evidenceDescription, invoiceIds, treatmentInput);
    const invoicesChanged = input.invoiceIds !== undefined || evidenceType !== current.evidenceType;
    return this.prisma.$transaction(async tx => {
      if (input.expenseType !== undefined) {
        data.expenseType = await this.resolveExpenseType(tx, input.expenseType);
      }
      const invoices = evidenceType === EVIDENCE_TYPE.INVOICE
        ? invoicesChanged
          ? await this.resolveInvoices(tx, invoiceIds, id)
          : current.invoices
        : [];
      if (evidenceType === EVIDENCE_TYPE.INVOICE && invoicesChanged && input.invoiceTaxTreatments === undefined) {
        throw new AppError("INVALID_INVOICE_TAX_TREATMENT", "选择发票时必须同时提交抵扣处理", 400);
      }
      const taxTreatments = evidenceType !== EVIDENCE_TYPE.INVOICE || input.invoiceTaxTreatments === undefined
        ? null
        : this.normalizeTaxTreatments(invoices, treatmentInput);
      if (evidenceType === EVIDENCE_TYPE.INVOICE) this.assertInvoiceCoverage((data.amount as Prisma.Decimal | undefined) ?? current.amount, invoices);
      const updateData: Prisma.ReimbursementUncheckedUpdateInput = { ...data };
      if (input.evidenceType !== undefined) updateData.evidenceType = evidenceType;
      if (evidenceType === EVIDENCE_TYPE.INVOICE) updateData.evidenceDescription = null;
      if (current.status !== STATUS.DRAFT) Object.assign(updateData, {
        status: STATUS.DRAFT,
        approvedAt: null,
        approvedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectReason: null,
      });
      if (invoicesChanged) {
        await tx.invoice.updateMany({ where: { reimbursementId: id, voucherId: null }, data: { reimbursementId: null } });
        await tx.invoiceUsage.deleteMany({ where: { sourceType: "REIMBURSEMENT", sourceId: id } });
      }
      if (current.status !== STATUS.DRAFT) await this.budget.release(tx, id);
      if (evidenceType === EVIDENCE_TYPE.INVOICE && invoicesChanged) {
        const reserved = await tx.invoice.updateMany({ where: { id: { in: invoices.map(row => row.id) }, voucherId: null, OR: [{ reimbursementId: null }, { reimbursementId: id }] }, data: { reimbursementId: id } });
        if (reserved.count !== invoices.length) throw new AppError("REIMBURSEMENT_INVOICE_IN_USE", "部分发票刚刚被其他报销单使用，请刷新后重试", 409);
        await tx.invoiceUsage.createMany({ data: invoices.map((invoice) => ({ invoiceId: invoice.id, sourceType: "REIMBURSEMENT", sourceId: id, amount: invoice.totalTaxIncludedAmount, createdById: actor.actorId })) });
      }
      if (taxTreatments) await this.saveTaxTreatments(tx, taxTreatments);
      const row = await tx.reimbursement.update({
        where: { id },
        data: updateData,
        include: includeDetail,
      });
      await this.audit(tx, actor.actorId, "UPDATE", "Reimbursement", id, { status: current.status, amount: current.amount.toString() }, { status: row.status, amount: row.amount.toString(), invoiceCount: row.invoices.length });
      return row;
    });
  }

  async remove(id: number, actor: ReimbursementActor) {
    const current = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    this.assertOwnerOrAdmin(current.createdById, actor);
    if (current.status === STATUS.PAID) throw new AppError("REIMBURSEMENT_PAID", "已付款的报销单不能删除", 409);
    await this.prisma.$transaction(async tx => {
      await tx.reimbursement.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.budget.release(tx, id);
      await tx.invoice.updateMany({ where: { reimbursementId: id, voucherId: null }, data: { reimbursementId: null } });
      await tx.invoiceUsage.deleteMany({ where: { sourceType: "REIMBURSEMENT", sourceId: id } });
      await this.audit(tx, actor.actorId, "DELETE", "Reimbursement", id, { status: current.status }, { deletedAt: new Date().toISOString() });
    });
  }

  async submit(id: number, actor: ReimbursementActor) {
    const current = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null }, include: { invoices: { where: { deletedAt: null } } } });
    if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    this.assertOwnerOrAdmin(current.createdById, actor);
    if (current.status !== STATUS.DRAFT && current.status !== STATUS.REJECTED) throw new AppError("INVALID_REIMBURSEMENT_STATUS", "仅草稿或已驳回的报销单可以提交", 409);
    this.assertEvidenceSelection(current.evidenceType, current.evidenceDescription, current.invoices.map(row => row.id), []);
    if (current.evidenceType === EVIDENCE_TYPE.INVOICE) this.assertInvoiceCoverage(current.amount, current.invoices);
    this.assertReadyForPosting(current.amount, current.invoices, current.evidenceType);
    if (current.evidenceType !== EVIDENCE_TYPE.INVOICE) {
      const attachmentCount = await this.prisma.attachmentRelation.count({ where: { sourceType: "Reimbursement", sourceId: id, deletedAt: null, attachment: { deletedAt: null } } });
      this.assertSupportingAttachment(attachmentCount);
    }
    const profile = await this.prisma.companyProfile.findFirst({ where: { deletedAt: null }, select: { operationMode: true } });
    const simpleMode = (profile?.operationMode ?? "SIMPLE") === "SIMPLE";
    return this.prisma.$transaction(async tx => {
      await this.budget.reserveForReimbursement(tx, {
        id,
        expenseDate: current.expenseDate,
        expenseType: current.expenseType,
        department: current.department,
        amount: current.amount,
      }, simpleMode);
      const data = simpleMode
        ? { status: STATUS.APPROVED, approvedAt: new Date(), approvedById: actor.actorId, rejectedAt: null, rejectedById: null, rejectReason: null }
        : { status: STATUS.PENDING, rejectedAt: null, rejectedById: null, rejectReason: null };
      const row = await tx.reimbursement.update({ where: { id }, data, include: includeDetail });
      await this.audit(tx, actor.actorId, simpleMode ? "REVIEW" : "UPDATE", "Reimbursement", id, { status: current.status }, { status: row.status, simpleMode });
      return row;
    });
  }

  async approve(id: number, actor: ReimbursementActor) {
    this.assertAdmin(actor);
    const current = await this.requireStatus(id, STATUS.PENDING);
    return this.transition(id, actor.actorId, "REVIEW", { status: STATUS.APPROVED, approvedAt: new Date(), approvedById: actor.actorId }, current.status);
  }

  async reject(id: number, input: ReimbursementRejectInput, actor: ReimbursementActor) {
    this.assertAdmin(actor);
    const current = await this.requireStatus(id, STATUS.PENDING);
    return this.prisma.$transaction(async tx => {
      await this.budget.release(tx, id);
      const row = await tx.reimbursement.update({ where: { id }, data: { status: STATUS.REJECTED, rejectedAt: new Date(), rejectedById: actor.actorId, rejectReason: input.reason?.trim() || null }, include: includeDetail });
      await this.audit(tx, actor.actorId, "REVIEW", "Reimbursement", id, { status: current.status }, { status: row.status });
      return row;
    });
  }

  async pay(id: number, input: ReimbursementPaymentInput, actor: ReimbursementActor) {
    this.assertPayer(actor);
    const paymentDate = this.date(input.paymentDate, "付款日期");
    const period = await this.periods.resolveOpenPeriod(paymentDate);
    if (input.expenseAccountId === input.paymentAccountId) throw new AppError("INVALID_REIMBURSEMENT_ACCOUNTS", "费用科目与付款科目不能相同", 400);
    return this.prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const current = await tx.reimbursement.findFirst({ where: { id, deletedAt: null }, include: { invoices: { where: { deletedAt: null } } } });
      if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
      if (current.status !== STATUS.APPROVED) throw new AppError("INVALID_REIMBURSEMENT_STATUS", "仅已通过的报销单可以付款", 409);
      this.assertEvidenceSelection(current.evidenceType, current.evidenceDescription, current.invoices.map(row => row.id), []);
      this.assertReadyForPosting(current.amount, current.invoices, current.evidenceType);
      if (current.evidenceType !== EVIDENCE_TYPE.INVOICE) {
        const attachmentCount = await tx.attachmentRelation.count({ where: { sourceType: "Reimbursement", sourceId: id, deletedAt: null, attachment: { deletedAt: null } } });
        this.assertSupportingAttachment(attachmentCount);
      }
      const profileModel = (tx as Prisma.TransactionClient & { companyProfile?: Prisma.TransactionClient["companyProfile"] }).companyProfile;
      const profile = profileModel ? await profileModel.findFirst({ where: { deletedAt: null }, select: { operationMode: true, bankAccount: true } }) : null;
      const budgetReservationModel = (tx as Prisma.TransactionClient & { budgetReservation?: Prisma.TransactionClient["budgetReservation"] }).budgetReservation;
      const hasReservation = budgetReservationModel
        ? await budgetReservationModel.findFirst({ where: { reimbursementId: id, status: 0 } })
        : null;
      if (!hasReservation && budgetReservationModel) await this.budget.reserveForReimbursement(tx, { id, expenseDate: current.expenseDate, expenseType: current.expenseType, department: current.department, amount: current.amount }, (profile?.operationMode ?? "SIMPLE") === "SIMPLE");
      const deductibleTaxAmount = current.invoices.reduce((sum, row) => sum.plus(row.deductibleTaxAmount), ZERO);
      const expenseAmount = current.amount.minus(deductibleTaxAmount);
      if (deductibleTaxAmount.greaterThan(0) && !input.inputTaxAccountId) {
        throw new AppError("INPUT_TAX_ACCOUNT_REQUIRED", "存在可抵扣税额时必须选择进项税额科目", 400);
      }
      if (!deductibleTaxAmount.greaterThan(0) && input.inputTaxAccountId) {
        throw new AppError("INPUT_TAX_ACCOUNT_NOT_ALLOWED", "没有可抵扣税额时不要选择进项税额科目", 400);
      }
      const accountIds = [input.expenseAccountId, input.paymentAccountId, ...(input.inputTaxAccountId ? [input.inputTaxAccountId] : [])];
      const accounts = await this.validateAccounts(tx, ...accountIds);
      if (input.inputTaxAccountId && !accounts.some(row => row.id === input.inputTaxAccountId && row.code === "22210101")) {
        throw new AppError("INVALID_INPUT_TAX_ACCOUNT", "进项税额科目必须选择 22210101 进项税额", 400);
      }
      let bankTransaction: Awaited<ReturnType<typeof tx.bankTransaction.findFirst>> = null;
      if (input.bankTransactionId) {
        await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} AND deleted_at IS NULL FOR UPDATE`;
        bankTransaction = await tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, deletedAt: null, voucherId: null, reimbursementPayment: null, taxPayment: null } });
        if (!bankTransaction) throw new AppError("BANK_TRANSACTION_UNAVAILABLE", "银行流水不存在或已被使用", 409);
        if (!bankTransaction.amount.abs().equals(current.amount.abs())) throw new AppError("BANK_AMOUNT_MISMATCH", "银行流水金额的绝对值必须等于报销付款金额", 409);
        if (!accounts.some(row => row.id === input.paymentAccountId && row.code.startsWith("1002"))) throw new AppError("INVALID_BANK_ACCOUNT", "选择银行流水时付款科目必须是银行存款末级科目", 400);
      }
      if (bankTransaction && this.bankDirection(bankTransaction, profile?.bankAccount) !== "OUTFLOW") throw new AppError("BANK_DIRECTION_MISMATCH", "Reimbursement payment must use an outgoing bank transaction", 409);
      const sequence = await this.nextVoucherNumber(tx, period.year);
      const invoiceNos = current.invoices.map(row => row.invoiceNumber).join(",");
      const evidenceLabel = current.evidenceType === EVIDENCE_TYPE.OTHER ? " 其他凭证" : current.evidenceType === EVIDENCE_TYPE.NO_INVOICE ? " 无票支出" : "";
      const summary = `报销付款：${current.applicantName} ${current.expenseType}${invoiceNos ? ` 发票${invoiceNos}` : evidenceLabel}`;
      const voucher = await tx.voucher.create({ data: {
        ...sequence,
        fiscalYear: period.year,
        fiscalPeriod: period.month,
        voucherDate: paymentDate,
        postingDate: paymentDate,
        periodId: period.id,
        summary,
        sourceType: "MANUAL",
        category: "PAYMENT",
        status: VOUCHER_STATUS.POSTED,
        totalDebit: current.amount,
        totalCredit: current.amount,
        createdById: actor.actorId,
        reviewerId: actor.actorId,
        reviewedAt: new Date(),
        postedById: actor.actorId,
        postedAt: new Date(),
        entries: { create: [
          { lineNo: 1, accountId: input.expenseAccountId, summary, debitAmount: expenseAmount, creditAmount: ZERO },
          ...(deductibleTaxAmount.greaterThan(0)
            ? [{ lineNo: 2, accountId: input.inputTaxAccountId!, summary, debitAmount: deductibleTaxAmount, creditAmount: ZERO }]
            : []),
          { lineNo: deductibleTaxAmount.greaterThan(0) ? 3 : 2, accountId: input.paymentAccountId, summary, debitAmount: ZERO, creditAmount: current.amount },
        ] },
      } });
      const event = await tx.accountingEvent.create({ data: { eventType: "REIMBURSEMENT_PAYMENT", sourceType: "Reimbursement", sourceId: id, voucherId: voucher.id, description: input.remark?.trim() || summary, createdById: actor.actorId } });
      if (bankTransaction) {
        await tx.bankTransaction.update({ where: { id: bankTransaction.id }, data: { voucherId: voucher.id } });
        const paymentEntry = await tx.voucherEntry.findFirstOrThrow({ where: { voucherId: voucher.id, accountId: input.paymentAccountId, deletedAt: null } });
        const reconciliation = await tx.bankReconciliation.findFirst({ where: { periodId: period.id, bankAccountId: input.paymentAccountId, status: 0, deletedAt: null } });
        if (reconciliation) await tx.bankReconciliationMatch.create({ data: { reconciliationId: reconciliation.id, bankTransactionId: bankTransaction.id, voucherEntryId: paymentEntry.id, matchedAmount: current.amount, matchType: "BUSINESS", matchedById: actor.actorId } });
      }
      const invoiceIds = current.invoices.map(row => row.id);
      if (invoiceIds.length) {
        const linked = await tx.invoice.updateMany({ where: { id: { in: invoiceIds }, deletedAt: null, reimbursementId: id, voucherId: null }, data: { voucherId: voucher.id } });
        if (linked.count !== invoiceIds.length) throw new AppError("REIMBURSEMENT_INVOICE_UNAVAILABLE", "部分发票已被其他凭证使用，不能重复入账", 409);
        await tx.voucherSource.createMany({ data: invoiceIds.map(invoiceId => ({ voucherId: voucher.id, invoiceId })) });
      }
      await this.budget.consume(tx, id);
      const row = await tx.reimbursement.update({ where: { id }, data: { status: STATUS.PAID, paidAt: new Date(), paidById: actor.actorId, expenseAccountId: input.expenseAccountId, paymentAccountId: input.paymentAccountId, inputTaxAccountId: input.inputTaxAccountId ?? null, bankTransactionId: bankTransaction?.id ?? null, voucherId: voucher.id, eventId: event.id }, include: includeDetail });
      await this.audit(tx, actor.actorId, "UPDATE", "Reimbursement", id, { status: current.status }, { status: row.status, voucherId: voucher.id });
      return row;
    });
  }

  async cancelPayment(id: number, reason: string, actor: ReimbursementActor) {
    this.assertAdmin(actor);
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) throw new AppError("INVALID_VOID_REASON", "撤销原因不能为空且不能超过500字", 400);
    return this.prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM reimbursements WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const current = await tx.reimbursement.findFirst({
        where: { id, deletedAt: null },
        include: { voucher: true, invoices: { where: { deletedAt: null } }, bankTransaction: true },
      });
      if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
      if (current.status !== STATUS.PAID || !current.voucherId || !current.voucher) {
        throw new AppError("REIMBURSEMENT_NOT_PAID", "仅已付款报销单可以撤销付款", 409);
      }
      await this.periods.assertVoucherOperation(current.voucher.periodId);
      const voucherId = current.voucherId;
      const now = new Date();
      const voucher = await tx.voucher.updateMany({ where: { id: voucherId, status: VOUCHER_STATUS.POSTED, deletedAt: null }, data: { status: VOUCHER_STATUS.VOID, voidById: actor.actorId, voidAt: now, voidReason: trimmed } });
      if (voucher.count !== 1) throw new AppError("REIMBURSEMENT_STATE_CONFLICT", "报销付款状态已发生变化", 409);
      await tx.invoice.updateMany({ where: { reimbursementId: id, voucherId }, data: { voucherId: null } });
      await this.budget.release(tx, id);
      if (current.bankTransactionId) {
        await tx.bankTransaction.updateMany({ where: { id: current.bankTransactionId, voucherId }, data: { voucherId: null } });
        await tx.bankReconciliationMatch.updateMany({ where: { bankTransactionId: current.bankTransactionId, voucherEntry: { voucherId }, deletedAt: null }, data: { deletedAt: now } });
      }
      const row = await tx.reimbursement.update({
        where: { id },
        data: { status: STATUS.APPROVED, paidAt: null, paidById: null, expenseAccountId: null, paymentAccountId: null, inputTaxAccountId: null, bankTransactionId: null, voucherId: null, eventId: null },
        include: includeDetail,
      });
      await this.audit(tx, actor.actorId, "UPDATE", "Reimbursement", id, { status: current.status, voucherId: current.voucherId }, { status: row.status, reason: trimmed });
      return row;
    });
  }

  private reimbursementData(input: Partial<ReimbursementInput>, partial = false): ReimbursementData {
    const out: ReimbursementData = {};
    if (input.applicantName !== undefined && !input.applicantName.trim()) throw new AppError("INVALID_REIMBURSEMENT", "报销人不能为空", 400);
    if (input.expenseType !== undefined && !input.expenseType.trim()) throw new AppError("INVALID_REIMBURSEMENT", "费用类型不能为空", 400);
    if (!partial && (!input.applicantName?.trim() || !input.expenseType?.trim())) throw new AppError("INVALID_REIMBURSEMENT", "报销人和费用类型不能为空", 400);
    if (input.applicantName !== undefined) out.applicantName = input.applicantName.trim();
    if (input.expenseType !== undefined) out.expenseType = input.expenseType.trim();
    if (input.department !== undefined) out.department = input.department.trim() || null;
    if (input.description !== undefined) out.description = input.description.trim() || null;
    if (input.evidenceType !== undefined) {
      if (!Number.isInteger(input.evidenceType) || input.evidenceType < EVIDENCE_TYPE.INVOICE || input.evidenceType > EVIDENCE_TYPE.NO_INVOICE) {
        throw new AppError("INVALID_REIMBURSEMENT_EVIDENCE_TYPE", "报销凭证类型无效", 400);
      }
      out.evidenceType = input.evidenceType;
    } else if (!partial) {
      out.evidenceType = EVIDENCE_TYPE.INVOICE;
    }
    if (input.evidenceDescription !== undefined) out.evidenceDescription = input.evidenceDescription.trim() || null;
    if (input.expenseDate !== undefined) out.expenseDate = this.date(input.expenseDate, "费用日期");
    if (!partial && input.expenseDate === undefined) throw new AppError("INVALID_REIMBURSEMENT", "费用日期不能为空", 400);
    if (input.amount !== undefined) out.amount = this.amount(input.amount);
    if (!partial && input.amount === undefined) throw new AppError("INVALID_REIMBURSEMENT_AMOUNT", "报销金额不能为空", 400);
    if (input.currency !== undefined) out.currency = input.currency.toUpperCase();
    if (out.currency && !/^[A-Z]{3}$/.test(String(out.currency))) throw new AppError("INVALID_CURRENCY", "币种必须为三位代码", 400);
    return out;
  }

  private async resolveInvoices(tx: Transaction, invoiceIds: number[], reimbursementId?: number) {
    if (!invoiceIds.length) throw new AppError("INVALID_REIMBURSEMENT_INVOICE", "至少需要选择一张已导入发票", 400);
    const ids = [...new Set(invoiceIds)];
    if (ids.length !== invoiceIds.length) throw new AppError("DUPLICATE_REIMBURSEMENT_INVOICE", "不能重复选择同一张发票", 400);
    const rows = await tx.invoice.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        status: { not: 2 },
        direction: "PURCHASE",
        voucherId: null,
        OR: [{ reimbursementId: null }, ...(reimbursementId ? [{ reimbursementId }] : [])],
      },
      select: { id: true, invoiceNumber: true, totalTaxAmount: true, totalTaxIncludedAmount: true, taxDeductionStatus: true, deductibleTaxAmount: true },
    });
    if (rows.length !== ids.length) throw new AppError("REIMBURSEMENT_INVOICE_UNAVAILABLE", "部分发票不存在、不是进项发票、已经用于其他报销单或已经入账", 409);
    const byId = new Map(rows.map(row => [row.id, row]));
    return ids.map(id => byId.get(id)!);
  }

  private normalizeTaxTreatments(
    invoices: Array<{ id: number; invoiceNumber: string; totalTaxAmount: Prisma.Decimal }>,
    input: NonNullable<ReimbursementInput["invoiceTaxTreatments"]>,
  ) {
    const byInvoiceId = new Map(input.map(row => [row.invoiceId, row]));
    if (byInvoiceId.size !== input.length || input.length !== invoices.length || invoices.some(row => !byInvoiceId.has(row.id))) {
      throw new AppError("INVALID_INVOICE_TAX_TREATMENT", "每张报销发票必须且只能提交一项抵扣处理", 400);
    }
    return invoices.map((invoice) => {
      const treatment = byInvoiceId.get(invoice.id)!;
      const status = treatment.deductionStatus;
      const amount = this.nonNegativeAmount(treatment.deductibleTaxAmount, "可抵扣税额");
      const tax = invoice.totalTaxAmount;
      if (status === TAX_DEDUCTION_STATUS.UNCONFIRMED && !amount.equals(0)) {
        throw new AppError("INVALID_INVOICE_TAX_TREATMENT", `发票 ${invoice.invoiceNumber} 待确认时抵扣税额必须为零`, 400);
      }
      if (status === TAX_DEDUCTION_STATUS.DEDUCTIBLE && (!tax.greaterThan(0) || !amount.equals(tax))) {
        throw new AppError("INVALID_INVOICE_TAX_TREATMENT", `发票 ${invoice.invoiceNumber} 全额抵扣金额必须等于发票税额`, 400);
      }
      if (status === TAX_DEDUCTION_STATUS.NON_DEDUCTIBLE && !amount.equals(0)) {
        throw new AppError("INVALID_INVOICE_TAX_TREATMENT", `发票 ${invoice.invoiceNumber} 不抵扣时抵扣税额必须为零`, 400);
      }
      if (status === TAX_DEDUCTION_STATUS.PARTIAL && (!amount.greaterThan(0) || !amount.lessThan(tax))) {
        throw new AppError("INVALID_INVOICE_TAX_TREATMENT", `发票 ${invoice.invoiceNumber} 部分抵扣税额必须大于零且小于发票税额`, 400);
      }
      if (![0, 1, 2, 3].includes(status)) throw new AppError("INVALID_INVOICE_TAX_TREATMENT", "发票抵扣状态无效", 400);
      return { invoiceId: invoice.id, taxDeductionStatus: status, deductibleTaxAmount: amount };
    });
  }

  private async saveTaxTreatments(tx: Transaction, treatments: Array<{ invoiceId: number; taxDeductionStatus: number; deductibleTaxAmount: Prisma.Decimal }>) {
    for (const treatment of treatments) {
      await tx.invoice.update({
        where: { id: treatment.invoiceId },
        data: { taxDeductionStatus: treatment.taxDeductionStatus, deductibleTaxAmount: treatment.deductibleTaxAmount },
      });
    }
  }

  private assertReadyForPosting(
    amount: Prisma.Decimal,
    invoices: Array<{ totalTaxAmount: Prisma.Decimal; totalTaxIncludedAmount: Prisma.Decimal; taxDeductionStatus: number; deductibleTaxAmount: Prisma.Decimal }>,
    evidenceType: number = EVIDENCE_TYPE.INVOICE,
  ) {
    if (evidenceType !== EVIDENCE_TYPE.INVOICE) {
      if (invoices.length) throw new AppError("INVALID_REIMBURSEMENT_EVIDENCE", "其他凭证或无票支出不能关联发票", 400);
      return;
    }
    const invoiceTotal = invoices.reduce((sum, row) => sum.plus(row.totalTaxIncludedAmount), ZERO);
    if (!invoiceTotal.equals(amount)) throw new AppError("REIMBURSEMENT_INVOICE_TOTAL_MISMATCH", "自动记账时报销金额必须等于所选发票价税合计", 400);
    if (invoices.some(row => row.taxDeductionStatus === TAX_DEDUCTION_STATUS.UNCONFIRMED)) {
      throw new AppError("INVOICE_TAX_TREATMENT_UNCONFIRMED", "存在尚未确认抵扣处理的发票", 400);
    }
    if (invoices.some(row => ![1, 2, 3].includes(row.taxDeductionStatus) || row.deductibleTaxAmount.lessThan(0) || row.deductibleTaxAmount.greaterThan(row.totalTaxAmount))) {
      throw new AppError("INVALID_INVOICE_TAX_TREATMENT", "发票抵扣状态或可抵扣税额无效", 400);
    }
    const deductibleTax = invoices.reduce((sum, row) => sum.plus(row.deductibleTaxAmount), ZERO);
    if (deductibleTax.greaterThan(amount)) throw new AppError("INVALID_DEDUCTIBLE_TAX_TOTAL", "可抵扣税额不能超过报销金额", 400);
  }

  private assertEvidenceSelection(
    evidenceType: number,
    evidenceDescription: string | null | undefined,
    invoiceIds: readonly unknown[],
    taxTreatments: readonly unknown[],
  ) {
    if (!Number.isInteger(evidenceType) || evidenceType < EVIDENCE_TYPE.INVOICE || evidenceType > EVIDENCE_TYPE.NO_INVOICE) {
      throw new AppError("INVALID_REIMBURSEMENT_EVIDENCE_TYPE", "报销凭证类型无效", 400);
    }
    if (evidenceType === EVIDENCE_TYPE.INVOICE) {
      if (!invoiceIds.length) throw new AppError("INVALID_REIMBURSEMENT_INVOICE", "发票模式至少需要选择一张已导入发票", 400);
      return;
    }
    if (invoiceIds.length || taxTreatments.length) throw new AppError("INVALID_REIMBURSEMENT_EVIDENCE", "其他凭证或无票支出不能选择发票或填写抵扣税额", 400);
    if (!evidenceDescription?.trim()) throw new AppError("REIMBURSEMENT_EVIDENCE_DESCRIPTION_REQUIRED", evidenceType === EVIDENCE_TYPE.NO_INVOICE ? "请填写无票原因" : "请填写其他凭证说明", 400);
  }

  private assertSupportingAttachment(attachmentCount: number) {
    if (attachmentCount < 1) throw new AppError("REIMBURSEMENT_ATTACHMENT_REQUIRED", "其他凭证或无票支出至少需要上传一个证明附件", 400);
  }

  private async resolveExpenseType(tx: Transaction, value: string) {
    const expenseType = value.trim();
    const row = await tx.dictionaryItem.findFirst({
      where: {
        value: expenseType,
        enabled: true,
        deletedAt: null,
        category: { code: EXPENSE_TYPE_DICTIONARY, enabled: true, deletedAt: null },
      },
      select: { value: true },
    });
    if (!row) throw new AppError("INVALID_REIMBURSEMENT_EXPENSE_TYPE", "请选择有效的费用类型", 400);
    return row.value;
  }

  private assertInvoiceCoverage(amount: Prisma.Decimal, invoices: Array<{ totalTaxIncludedAmount: Prisma.Decimal }>) {
    const invoiceTotal = invoices.reduce((sum, row) => sum.plus(row.totalTaxIncludedAmount), ZERO);
    if (invoiceTotal.lessThan(amount)) throw new AppError("REIMBURSEMENT_EXCEEDS_INVOICES", "报销金额不能超过发票合计金额", 400, { reimbursementAmount: amount.toString(), invoiceTotal: invoiceTotal.toString() });
  }

  private async requireStatus(id: number, status: number) {
    const current = await this.prisma.reimbursement.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("REIMBURSEMENT_NOT_FOUND", "报销单不存在", 404);
    if (current.status !== status) throw new AppError("INVALID_REIMBURSEMENT_STATUS", `报销单当前状态不能执行该操作`, 409);
    return current;
  }

  private transition(id: number, actorId: number, action: "SUBMIT" | "REVIEW", data: Prisma.ReimbursementUncheckedUpdateInput, previousStatus?: number) {
    return this.prisma.$transaction(async tx => {
      const before = previousStatus ?? (await tx.reimbursement.findUnique({ where: { id }, select: { status: true } }))?.status;
      const row = await tx.reimbursement.update({ where: { id }, data, include: includeDetail });
      await this.audit(tx, actorId, action === "SUBMIT" ? "UPDATE" : "REVIEW", "Reimbursement", id, { status: before }, { status: row.status });
      return row;
    });
  }

  private assertAdmin(actor: ReimbursementActor) {
    if (canManageAccounting(actor.role)) return;
    if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以审批或付款报销单", 403);
  }

  private assertPayer(actor: ReimbursementActor) {
    if (canOperateCash(actor.role)) return;
    throw new AppError("FORBIDDEN", "仅出纳或财务主管可以付款报销单", 403);
  }

  private assertOwnerOrAdmin(createdById: number, actor: ReimbursementActor) {
    if (canManageAccounting(actor.role)) return;
    if (actor.role !== "ADMIN" && createdById !== actor.actorId) throw new AppError("FORBIDDEN", "仅创建人或管理员可以操作该报销单", 403);
  }

  private amount(value: string) {
    if (!/^\d{1,15}(\.\d{1,4})?$/.test(value) || new Prisma.Decimal(value).lessThanOrEqualTo(0)) throw new AppError("INVALID_AMOUNT", "金额必须为大于零且最多四位小数的数值", 400);
    return new Prisma.Decimal(value);
  }

  private nonNegativeAmount(value: string, field: string) {
    if (!/^\d{1,15}(\.\d{1,4})?$/.test(value)) throw new AppError("INVALID_AMOUNT", `${field}必须为非负数且最多四位小数`, 400);
    return new Prisma.Decimal(value);
  }

  private status(value: string) {
    const status = Number(value);
    if (!Number.isInteger(status) || status < STATUS.DRAFT || status > STATUS.PAID) throw new AppError("INVALID_REIMBURSEMENT_STATUS", "报销单状态无效", 400);
    return status;
  }

  private date(value: string, field: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new AppError("INVALID_DATE", `${field}无效`, 400);
    return date;
  }

  private async validateAccounts(tx: Transaction, ...ids: number[]) {
    if (new Set(ids).size !== ids.length) throw new AppError("INVALID_REIMBURSEMENT_ACCOUNTS", "费用、进项税额和付款科目不能相同", 400);
    const accounts = await tx.account.findMany({ where: { id: { in: ids }, deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true, code: true } });
    if (accounts.length !== ids.length) throw new AppError("ACCOUNT_NOT_POSTABLE", "报销付款科目不存在、未启用或不是末级科目", 400);
    return accounts;
  }

  private bankDirection(item: { amount: Prisma.Decimal; payerAccount: string | null; payeeAccount: string | null; reconciliationDirection?: string | null }, companyBankAccount?: string | null) {
    if (item.reconciliationDirection === "INFLOW" || item.reconciliationDirection === "OUTFLOW") return item.reconciliationDirection;
    const normalize = (value?: string | null) => value?.replace(/\D/g, "") ?? "";
    const own = normalize(companyBankAccount);
    const payer = normalize(item.payerAccount);
    const payee = normalize(item.payeeAccount);
    if (own && payer === own && payee !== own) return "OUTFLOW" as const;
    if (own && payee === own && payer !== own) return "INFLOW" as const;
    return item.amount.isNegative() ? "OUTFLOW" as const : "INFLOW" as const;
  }

  private nextReimbursementNo() {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `RB-${today}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  }

  private async nextVoucherNumber(tx: Transaction, year: number) {
    await tx.$executeRaw`INSERT IGNORE INTO voucher_sequences (fiscal_year,next_value,created_at,updated_at,deleted_at) VALUES (${year},1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)`;
    const rows = await tx.$queryRaw<Array<{ next_value: number }>>`SELECT next_value FROM voucher_sequences WHERE fiscal_year=${year} FOR UPDATE`;
    const sequenceNo = Number(rows[0]?.next_value);
    await tx.voucherSequence.update({ where: { fiscalYear: year }, data: { nextValue: sequenceNo + 1 } });
    return { sequenceNo, voucherNo: `${year}-${String(sequenceNo).padStart(6, "0")}` };
  }

  private audit(tx: Transaction, actorId: number, action: "CREATE" | "UPDATE" | "DELETE" | "REVIEW", resourceType: string, resourceId: number, beforeData: object | null, afterData: object) {
    return tx.auditLog.create({ data: { actorId, action, resourceType, resourceId, beforeData: beforeData ?? Prisma.JsonNull, afterData } });
  }
}
