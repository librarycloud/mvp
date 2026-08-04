import { Prisma, type PrismaClient, type ReportPeriodType, type TaxDeclarationType } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import type { TaxPeriodQuery } from "./dto/tax.dto.js";

const ZERO = new Prisma.Decimal(0);
type DeclarationPeriod = TaxPeriodQuery & { period?: number };
interface DeclarationLineInput { lineCode: string; adjustmentAmount: string; remark?: string }

export class TaxService {
  constructor(private readonly prisma: PrismaClient) {}

  async inputLedger(period: TaxPeriodQuery) { return this.ledger(period, "PURCHASE"); }
  async outputLedger(period: TaxPeriodQuery) { return this.ledger(period, "SALE"); }

  async foundation(period: TaxPeriodQuery) {
    const dates = this.dates(period);
    const [output, input] = await Promise.all([this.sum("SALE", dates.start, dates.end), this.sum("PURCHASE", dates.start, dates.end)]);
    return {
      ...period,
      startDate: dates.start,
      endDate: dates.end,
      output: this.amounts(output),
      input: { ...this.amounts(input), deductibleTax: input.deductibleTax.toString() },
      taxPayableBeforeOtherAdjustments: output.tax.minus(input.deductibleTax).toString(),
    };
  }

  async listDeclarations(period?: Partial<DeclarationPeriod>) {
    return this.prisma.taxDeclaration.findMany({
      where: {
        deletedAt: null,
        ...(period?.fiscalYear ? { fiscalYear: period.fiscalYear } : {}),
        ...(period?.periodType ? { periodType: period.periodType as ReportPeriodType } : {}),
        ...(period?.period ? { period: period.period } : {}),
      },
      include: { lines: { orderBy: { lineCode: "asc" } }, payments: { orderBy: { paymentDate: "asc" } } },
      orderBy: [{ fiscalYear: "desc" }, { periodStart: "desc" }, { taxType: "asc" }],
    });
  }

  async getDeclaration(id: number) {
    return this.getDeclarationFrom(this.prisma, id);
  }

  private async getDeclarationFrom(prisma: Pick<PrismaClient, "taxDeclaration">, id: number) {
    const declaration = await prisma.taxDeclaration.findFirst({ where: { id, deletedAt: null }, include: { lines: { orderBy: { lineCode: "asc" } }, payments: { orderBy: { paymentDate: "asc" } } } });
    if (!declaration) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
    return declaration;
  }

  async prepare(type: TaxDeclarationType, period: DeclarationPeriod, actorId: number) {
    const dates = this.dates(period);
    const lines = await this.buildLines(type, dates.start, dates.end);
    const payable = lines.find((line) => line.lineCode === "PAYABLE")?.calculated ?? ZERO;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.taxDeclaration.findFirst({ where: { taxType: type, fiscalYear: period.fiscalYear, periodType: period.periodType, period: period.period ?? null, deletedAt: null } });
      if (existing && existing.status !== "DRAFT") throw new AppError("TAX_DECLARATION_LOCKED", "已复核或已申报的税务记录不能重新取数", 409);
      const declaration = existing
        ? await tx.taxDeclaration.update({ where: { id: existing.id }, data: { periodStart: dates.start, periodEnd: dates.end, payableAmount: payable, declaredAmount: payable } })
        : await tx.taxDeclaration.create({ data: { taxType: type, fiscalYear: period.fiscalYear, periodType: period.periodType, period: period.period ?? null, periodStart: dates.start, periodEnd: dates.end, payableAmount: payable, declaredAmount: payable, createdById: actorId } });
      await tx.taxDeclarationLine.deleteMany({ where: { declarationId: declaration.id } });
      await tx.taxDeclarationLine.createMany({ data: lines.map((line) => ({ declarationId: declaration.id, ...line, adjustment: ZERO, declared: line.calculated })) });
      await tx.auditLog.create({ data: { actorId, action: "CREATE", resourceType: "TaxDeclaration", resourceId: declaration.id, description: "生成税务申报底稿", afterData: { taxType: type, period: `${period.fiscalYear}-${period.periodType}-${period.period ?? "YEAR"}`, payableAmount: payable.toString() } } });
      return this.getDeclarationFrom(tx, declaration.id);
    });
  }

  async updateLines(id: number, inputs: DeclarationLineInput[], actorId: number) {
    if (!inputs.length) throw new AppError("TAX_DECLARATION_LINES_REQUIRED", "至少需要一条调整记录", 400);
    if (new Set(inputs.map((input) => input.lineCode)).size !== inputs.length) throw new AppError("DUPLICATE_TAX_ADJUSTMENT", "同一申报行次不能重复调整", 400);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_declarations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const declaration = await tx.taxDeclaration.findFirst({ where: { id, deletedAt: null }, include: { lines: true } });
      if (!declaration) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
      if (declaration.status !== "DRAFT") throw new AppError("TAX_DECLARATION_LOCKED", "只有草稿税务申报可以调整", 409);
      const known = new Set(declaration.lines.map((line) => line.lineCode));
      for (const input of inputs) {
        if (!known.has(input.lineCode) || !/^-?\d{1,15}(?:\.\d{1,4})?$/.test(input.adjustmentAmount)) throw new AppError("INVALID_TAX_ADJUSTMENT", "税务调整参数无效", 400);
        const adjustment = new Prisma.Decimal(input.adjustmentAmount);
        const current = declaration.lines.find((line) => line.lineCode === input.lineCode)!;
        await tx.taxDeclarationLine.update({ where: { id: current.id }, data: { adjustment, declared: current.calculated.plus(adjustment), remark: input.remark?.trim() || null } });
      }
      const lines = await tx.taxDeclarationLine.findMany({ where: { declarationId: id } });
      const payable = lines.find((line) => line.lineCode === "PAYABLE");
      const declaredAmount = payable?.declared ?? ZERO;
      if (declaredAmount.lessThan(0)) throw new AppError("NEGATIVE_TAX_PAYABLE", "申报应缴金额不能为负数，请将留抵或减免记录在对应行次", 400);
      await tx.taxDeclaration.update({ where: { id }, data: { payableAmount: declaredAmount, declaredAmount } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "TaxDeclaration", resourceId: id, description: "调整税务申报行次", afterData: { lines: inputs as unknown as Prisma.InputJsonValue } } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  async review(id: number, actorId: number) {
    return this.changeStatus(id, "DRAFT", "REVIEWED", actorId, "复核税务申报底稿");
  }

  async declare(id: number, declarationNo: string, actorId: number) {
    const number = declarationNo.trim();
    if (!number) throw new AppError("TAX_DECLARATION_NO_REQUIRED", "请填写申报编号或回执编号", 400);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_declarations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const row = await tx.taxDeclaration.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
      const simpleMode = await this.isSimpleMode(tx);
      if (row.status !== "REVIEWED" && !(simpleMode && row.status === "DRAFT")) throw new AppError("TAX_DECLARATION_NOT_REVIEWED", "税务申报底稿尚未复核", 409);
      await tx.taxDeclaration.update({ where: { id }, data: { status: "DECLARED", declarationNo: number, declaredAt: new Date(), declaredById: actorId } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "TaxDeclaration", resourceId: id, description: "提交税务申报", afterData: { declarationNo: number } } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  async pay(id: number, input: { amount: string; paymentDate: string; paymentReference?: string; bankTransactionId?: number }, actorId: number) {
    if (!/^\d{1,15}(?:\.\d{1,4})?$/.test(input.amount)) throw new AppError("INVALID_TAX_PAYMENT", "税款金额格式无效", 400);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(ZERO)) throw new AppError("INVALID_TAX_PAYMENT", "税款金额必须大于零", 400);
    const paymentDate = new Date(`${input.paymentDate}T00:00:00.000Z`);
    if (Number.isNaN(paymentDate.getTime())) throw new AppError("INVALID_TAX_PAYMENT_DATE", "缴款日期无效", 400);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_declarations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const declaration = await tx.taxDeclaration.findFirst({ where: { id, deletedAt: null }, include: { payments: true } });
      if (!declaration) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
      if (declaration.status !== "DECLARED" && declaration.status !== "PAID") throw new AppError("TAX_DECLARATION_NOT_DECLARED", "税务申报尚未提交", 409);
      const alreadyPaid = declaration.payments.reduce((sum, item) => sum.plus(item.amount), ZERO);
      if (alreadyPaid.plus(amount).greaterThan(declaration.declaredAmount)) throw new AppError("TAX_PAYMENT_EXCEEDED", "缴款金额不能超过申报应缴金额", 400);
      if (input.bankTransactionId) {
        await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} AND deleted_at IS NULL FOR UPDATE`;
        const bankTransaction = await tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, deletedAt: null, reimbursementPayment: null } });
        if (!bankTransaction) throw new AppError("BANK_TRANSACTION_NOT_FOUND", "Bank transaction not found", 404);
        if (bankTransaction.voucherId) throw new AppError("BANK_TRANSACTION_ALREADY_MATCHED", "Bank transaction is already posted and cannot be bound to a tax payment", 409);
        if (!bankTransaction.amount.abs().equals(amount)) throw new AppError("BANK_AMOUNT_MISMATCH", "Bank transaction amount does not match tax payment amount", 409);
        const profile = await tx.companyProfile.findFirst({ where: { deletedAt: null }, select: { bankAccount: true } });
        if (this.bankDirection(bankTransaction, profile?.bankAccount) !== "OUTFLOW") {
          throw new AppError("BANK_DIRECTION_MISMATCH", "Tax payment must be bound to an outgoing bank transaction", 409);
        }
        const used = await tx.taxPayment.findFirst({ where: { bankTransactionId: input.bankTransactionId } });
        if (used) throw new AppError("BANK_TRANSACTION_ALREADY_MATCHED", "Bank transaction is already bound to another tax payment", 409);
      }
      await tx.taxPayment.create({ data: { declarationId: id, amount, paymentDate, paymentReference: input.paymentReference?.trim() || null, bankTransactionId: input.bankTransactionId ?? null, paidById: actorId } });
      if (alreadyPaid.plus(amount).equals(declaration.declaredAmount)) await tx.taxDeclaration.update({ where: { id }, data: { status: "PAID" } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "TaxDeclaration", resourceId: id, description: "登记税款缴纳", afterData: { amount: amount.toString(), paymentDate: input.paymentDate, paymentReference: input.paymentReference ?? null } } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  private async changeStatus(id: number, from: "DRAFT", to: "REVIEWED", actorId: number, description: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_declarations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const row = await tx.taxDeclaration.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
      if (row.status !== from) throw new AppError("INVALID_TAX_DECLARATION_STATUS", "税务申报当前状态不允许此操作", 409);
      await tx.taxDeclaration.update({ where: { id }, data: { status: to, reviewedAt: new Date(), reviewedById: actorId } });
      await tx.auditLog.create({ data: { actorId, action: "REVIEW", resourceType: "TaxDeclaration", resourceId: id, description } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  private async isSimpleMode(prisma: Pick<PrismaClient, "companyProfile">) {
    const profile = await prisma.companyProfile.findFirst({ where: { deletedAt: null }, select: { operationMode: true } });
    return (profile?.operationMode ?? "SIMPLE") === "SIMPLE";
  }

  private async buildLines(type: TaxDeclarationType, start: Date, end: Date) {
    const [output, input] = await Promise.all([this.sum("SALE", start, end), this.sum("PURCHASE", start, end)]);
    const vat = output.tax.minus(input.deductibleTax);
    if (type === "VAT") return [
      { lineCode: "OUTPUT_TAX", lineName: "销项税额", calculated: output.tax },
      { lineCode: "DEDUCTIBLE_INPUT_TAX", lineName: "可抵扣进项税额", calculated: input.deductibleTax.negated() },
      { lineCode: "PAYABLE", lineName: "应缴增值税", calculated: Prisma.Decimal.max(vat, ZERO) },
    ];
    if (type === "SURCHARGE") return [
      { lineCode: "VAT_BASE", lineName: "增值税计税依据", calculated: Prisma.Decimal.max(vat, ZERO) },
      { lineCode: "SURCHARGE", lineName: "附加税费（按 12% 预估）", calculated: Prisma.Decimal.max(vat, ZERO).mul("0.12") },
      { lineCode: "PAYABLE", lineName: "应缴附加税费", calculated: Prisma.Decimal.max(vat, ZERO).mul("0.12") },
    ];
    return [
      { lineCode: "TAXABLE_INCOME", lineName: "应纳税所得额（请调整确认）", calculated: ZERO },
      { lineCode: "PAYABLE", lineName: "应缴企业所得税（请调整确认）", calculated: ZERO },
    ];
  }

  private async ledger(period: TaxPeriodQuery, direction: "PURCHASE" | "SALE") {
    const dates = this.dates(period);
    const rows = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: 1, direction, issueDate: { gte: dates.start, lte: dates.end } },
      include: { items: { where: { deletedAt: null }, orderBy: { lineNo: "asc" } } },
      orderBy: [{ issueDate: "asc" }, { invoiceNumber: "asc" }],
    });
    return rows.map((row) => ({ ...row, totalAmountWithoutTax: row.totalAmountWithoutTax.toString(), totalTaxAmount: row.totalTaxAmount.toString(), totalTaxIncludedAmount: row.totalTaxIncludedAmount.toString(), deductibleTaxAmount: row.deductibleTaxAmount.toString() }));
  }

  private async sum(direction: "PURCHASE" | "SALE", start: Date, end: Date) {
    const rows = await this.prisma.invoice.aggregate({ where: { deletedAt: null, status: 1, direction, issueDate: { gte: start, lte: end } }, _sum: { totalAmountWithoutTax: true, totalTaxAmount: true, totalTaxIncludedAmount: true, deductibleTaxAmount: true } });
    return { amountWithoutTax: rows._sum.totalAmountWithoutTax ?? ZERO, tax: rows._sum.totalTaxAmount ?? ZERO, includedAmount: rows._sum.totalTaxIncludedAmount ?? ZERO, deductibleTax: rows._sum.deductibleTaxAmount ?? ZERO };
  }

  private amounts(value: { amountWithoutTax: Prisma.Decimal; tax: Prisma.Decimal; includedAmount: Prisma.Decimal }) { return { amountWithoutTax: value.amountWithoutTax.toString(), tax: value.tax.toString(), includedAmount: value.includedAmount.toString() }; }

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

  private dates(period: TaxPeriodQuery) {
    if (!Number.isInteger(period.fiscalYear) || period.fiscalYear < 2000 || period.fiscalYear > 9999) throw new AppError("INVALID_TAX_PERIOD", "税务年度无效", 400);
    if (period.periodType === "YEAR") return { start: new Date(Date.UTC(period.fiscalYear, 0, 1)), end: new Date(Date.UTC(period.fiscalYear, 11, 31, 23, 59, 59, 999)) };
    const max = period.periodType === "MONTH" ? 12 : 4;
    const periodNumber = period.period;
    if (typeof periodNumber !== "number" || !Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > max) throw new AppError("INVALID_TAX_PERIOD", "税务期间无效", 400);
    const startMonth = period.periodType === "MONTH" ? periodNumber - 1 : (periodNumber - 1) * 3;
    const endMonth = period.periodType === "MONTH" ? startMonth : startMonth + 2;
    return { start: new Date(Date.UTC(period.fiscalYear, startMonth, 1)), end: new Date(Date.UTC(period.fiscalYear, endMonth + 1, 0, 23, 59, 59, 999)) };
  }
}
