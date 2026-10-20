import { Prisma, type PrismaClient, type ReportPeriodType, type TaxDeclarationType } from "../../generated/prisma/client.js";
import ExcelJS from "exceljs";
import { AppError } from "../../common/errors/app-error.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import { getNextVoucherNumber } from "../voucher/voucher-numbering.helper.js";
import type { TaxPeriodQuery } from "./dto/tax.dto.js";

const ZERO = new Prisma.Decimal(0);
type DeclarationPeriod = TaxPeriodQuery & { period?: number };
interface DeclarationLineInput { lineCode: string; adjustmentAmount: string; remark?: string }
interface TaxProfile {
  vatTaxpayerType: "UNKNOWN" | "SMALL_SCALE" | "GENERAL";
  vatFilingPeriod: "UNKNOWN" | "MONTH" | "QUARTER";
  citFilingPeriod: "UNKNOWN" | "MONTH" | "QUARTER";
  citTaxCollectionMethod: "UNKNOWN" | "ACCOUNTING" | "ASSESSED";
  smallProfitEnterpriseEligible: "UNKNOWN" | "YES" | "NO";
  surchargeReductionEligible: "UNKNOWN" | "YES" | "NO";
  urbanMaintenanceRate: Prisma.Decimal | null;
  educationSurchargeRate: Prisma.Decimal;
  localEducationSurchargeRate: Prisma.Decimal;
  surchargeReductionRate: Prisma.Decimal;
}

export class TaxService {
  constructor(private readonly prisma: PrismaClient, private readonly periods?: AccountingPeriodResolver) {}

  async inputLedger(period: TaxPeriodQuery) { return this.ledger(period, "PURCHASE"); }
  async outputLedger(period: TaxPeriodQuery) { return this.ledger(period, "SALE"); }

  async foundation(period: TaxPeriodQuery) {
    const dates = this.dates(period);
    const [output, input, profile] = await Promise.all([this.sum("SALE", dates.start, dates.end), this.sum("PURCHASE", dates.start, dates.end), this.taxProfile()]);
    const deductibleInputTax = profile.vatTaxpayerType === "GENERAL" ? input.deductibleTax : ZERO;
    return {
      ...period,
      startDate: dates.start,
      endDate: dates.end,
      output: this.amounts(output),
      input: { ...this.amounts(input), deductibleTax: deductibleInputTax.toString() },
      estimateBasis: profile.vatTaxpayerType === "GENERAL" ? "GENERAL" : profile.vatTaxpayerType === "SMALL_SCALE" ? "SMALL_SCALE" : "UNKNOWN",
      taxPayableBeforeOtherAdjustments: output.tax.minus(deductibleInputTax).toString(),
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
      include: { lines: { orderBy: { lineCode: "asc" } }, payments: { include: { voucher: true }, orderBy: { paymentDate: "asc" } } },
      orderBy: [{ fiscalYear: "desc" }, { periodStart: "desc" }, { taxType: "asc" }],
    });
  }

  async getDeclaration(id: number) {
    return this.getDeclarationFrom(this.prisma, id);
  }

  async exportDraft(id: number) {
    const declaration = await this.getDeclaration(id);
    const profile = await this.prisma.companyProfile.findFirst({ where: { deletedAt: null } });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Finance MVP";
    const sheet = workbook.addWorksheet("内部填报底稿");
    sheet.columns = [
      { key: "code", width: 24 },
      { key: "name", width: 34 },
      { key: "calculated", width: 18 },
      { key: "adjustment", width: 18 },
      { key: "declared", width: 18 },
      { key: "remark", width: 42 },
    ];
    sheet.addRow(["企业名称", profile?.name ?? ""]);
    sheet.addRow(["统一社会信用代码", profile?.unifiedSocialCreditCode ?? ""]);
    sheet.addRow(["税种", declaration.taxType]);
    sheet.addRow(["申报期间", `${declaration.periodStart.toISOString().slice(0, 10)} 至 ${declaration.periodEnd.toISOString().slice(0, 10)}`]);
    sheet.addRow(["重要说明", "内部填报底稿，非税务机关官方申报表；请核对电子税务局表单及纳税调整后再填报。"]);
    sheet.addRow([]);
    sheet.addRow(["行次代码", "项目", "系统测算", "人工调整", "填报参考数", "备注"]);
    for (const line of declaration.lines) sheet.addRow({ code: line.lineCode, name: line.lineName, calculated: Number(line.calculated), adjustment: Number(line.adjustment), declared: Number(line.declared), remark: line.remark ?? "" });
    sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315B5A" } };
    sheet.getRow(5).font = { bold: true, color: { argb: "FF9A3412" } };
    sheet.views = [{ state: "frozen", ySplit: 7 }];
    for (const row of sheet.getRows(8, declaration.lines.length) ?? []) {
      const code = String(row.getCell(1).value ?? "");
      const numberFormat = code.includes("RATE") || code === "TAX_RATE" ? "0.00%" : "#,##0.00;[Red](#,##0.00)";
      for (let column = 3; column <= 5; column++) row.getCell(column).numFmt = numberFormat;
    }
    const payments = workbook.addWorksheet("缴款记录");
    payments.columns = [
      { header: "缴款日期", key: "date", width: 16 },
      { header: "金额", key: "amount", width: 18 },
      { header: "缴款编号", key: "reference", width: 28 },
      { header: "凭证号", key: "voucher", width: 24 },
    ];
    for (const payment of declaration.payments) payments.addRow({ date: payment.paymentDate.toISOString().slice(0, 10), amount: Number(payment.amount), reference: payment.paymentReference ?? "", voucher: payment.voucher?.voucherNo ?? "" });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async getDeclarationFrom(prisma: Pick<PrismaClient, "taxDeclaration">, id: number) {
    const declaration = await prisma.taxDeclaration.findFirst({ where: { id, deletedAt: null }, include: { lines: { orderBy: { lineCode: "asc" } }, payments: { include: { voucher: true }, orderBy: { paymentDate: "asc" } } } });
    if (!declaration) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
    return declaration;
  }

  async prepare(type: TaxDeclarationType, period: DeclarationPeriod, actorId: number) {
    const dates = this.dates(period);
    const profile = await this.taxProfile();
    this.assertTaxProfile(type, period, profile);
    const lines = await this.buildLines(type, dates.start, dates.end, profile, period.periodType === "YEAR");
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
      this.recalculateLines(declaration.taxType, lines);
      for (const line of lines) await tx.taxDeclarationLine.update({ where: { id: line.id }, data: { calculated: line.calculated, declared: line.declared } });
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

  async declare(id: number, declarationNo: string | undefined, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_declarations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const row = await tx.taxDeclaration.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new AppError("TAX_DECLARATION_NOT_FOUND", "税务申报记录不存在", 404);
      const simpleMode = await this.isSimpleMode(tx);
      if (row.status !== "REVIEWED" && !(simpleMode && row.status === "DRAFT")) throw new AppError("TAX_DECLARATION_NOT_REVIEWED", "税务申报底稿尚未复核", 409);
      const number = declarationNo?.trim();
      if (!number) throw new AppError("TAX_DECLARATION_NUMBER_REQUIRED", "请填写电子税务局返回的实际申报编号或回执编号", 400);
      await tx.taxDeclaration.update({ where: { id }, data: { status: "DECLARED", declarationNo: number, declaredAt: new Date(), declaredById: actorId } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "TaxDeclaration", resourceId: id, description: "提交税务申报", afterData: { declarationNo: number } } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  async inspectRisks(id: number) {
    const declaration = await this.getDeclaration(id);
    const risks: Array<{ ruleCode: string; ruleName: string; level: "INFO" | "WARN" | "BLOCK"; message: string }> = [];
    const payableAmount = declaration.declaredAmount;
    const lines = declaration.lines;

    if (declaration.taxType === "VAT") {
      const outputLine = lines.find((l) => l.lineCode === "OUTPUT_TAX");
      const outputTax = outputLine?.declared ?? ZERO;

      if (outputTax.greaterThan(0) && payableAmount.isZero()) {
        risks.push({
          ruleCode: "VAT_ZERO_DECLARATION",
          ruleName: "有销项零申报风险",
          level: "WARN",
          message: `本期销项税额 ¥${outputTax.toString()}，但申报应缴税款为 0（被进项完全抵扣），可能引发税务局进项过度抵扣预警`,
        });
      }

      if (outputTax.greaterThan(0) && payableAmount.isZero()) risks.push({
        ruleCode: "VAT_ZERO_PAYABLE",
        ruleName: "销项税额被抵扣或调整为零",
        level: "INFO",
        message: "系统仅基于发票台账测算；请核对留抵、减免和申报表口径后再填报。",
      });
    } else if (declaration.taxType === "CORPORATE_INCOME") {
      if (payableAmount.isZero()) {
        risks.push({
          ruleCode: "CIT_ZERO_PAYABLE",
          ruleName: "企业所得税零预缴提示",
          level: "INFO",
          message: "本期账簿核算为零利润或亏损，系统自动按零申报生成预缴底稿",
        });
      }
    }

    return {
      declarationId: id,
      taxType: declaration.taxType,
      riskCount: risks.filter((r) => r.level !== "INFO").length,
      risks,
    };
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

      const period = this.periods
        ? await this.periods.resolveOpenPeriod(paymentDate)
        : await tx.accountingPeriod.findFirst({ where: { startDate: { lte: paymentDate }, endDate: { gte: paymentDate }, status: 0, deletedAt: null } });
      if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "缴款日期没有对应的开放会计期间，未登记缴款", 409);
      const bankAccount = await (tx as any).account.findFirst({
        where: { code: "1002", deletedAt: null, isEnabled: true, isLeaf: true },
        select: { id: true },
      }) ?? await (tx as any).account.findFirst({
        where: { code: { startsWith: "1002" }, deletedAt: null, isEnabled: true, isLeaf: true },
        select: { id: true },
      });
      let taxAccountCodePrefix = "2221";
      if (declaration.taxType === "VAT") taxAccountCodePrefix = "222101";
      else if (declaration.taxType === "CORPORATE_INCOME") taxAccountCodePrefix = "222102";
      else if (declaration.taxType === "SURCHARGE") taxAccountCodePrefix = "222103";
      const taxAccount = await (tx as any).account.findFirst({
        where: { code: { startsWith: taxAccountCodePrefix }, deletedAt: null, isEnabled: true, isLeaf: true },
        select: { id: true },
      }) ?? await (tx as any).account.findFirst({
        where: { code: { startsWith: "2221" }, deletedAt: null, isEnabled: true, isLeaf: true },
        select: { id: true },
      });
      if (!bankAccount || !taxAccount) throw new AppError("TAX_PAYMENT_ACCOUNTS_REQUIRED", "缺少可用的银行存款或应交税费科目，无法登记缴款", 409);

      const sequence = await getNextVoucherNumber(tx as any, period.year);
      const taxTypeName = declaration.taxType === "VAT" ? "增值税" : declaration.taxType === "CORPORATE_INCOME" ? "企业所得税" : "附加税费";
      const summary = `缴纳${period.periodCode}${taxTypeName}：${declaration.declarationNo || declaration.taxType}`;
      const voucher = await (tx as any).voucher.create({
        data: {
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
          totalDebit: amount,
          totalCredit: amount,
          createdById: actorId,
          reviewerId: actorId,
          reviewedAt: new Date(),
          postedById: actorId,
          postedAt: new Date(),
          entries: {
            create: [
              { lineNo: 1, accountId: taxAccount.id, summary, debitAmount: amount, creditAmount: ZERO },
              { lineNo: 2, accountId: bankAccount.id, summary, debitAmount: ZERO, creditAmount: amount },
            ],
          },
        },
      });
      const payment = await tx.taxPayment.create({ data: { declarationId: id, amount, paymentDate, paymentReference: input.paymentReference?.trim() || null, bankTransactionId: input.bankTransactionId ?? null, voucherId: voucher.id, paidById: actorId } });
      if ((tx as any).accountingEvent) {
        await (tx as any).accountingEvent.create({
          data: { eventType: "TAX_PAYMENT", sourceType: "TaxPayment", sourceId: payment.id, voucherId: voucher.id, description: summary, createdById: actorId },
        });
      }
      if (input.bankTransactionId) await (tx as any).bankTransaction.update({ where: { id: input.bankTransactionId }, data: { voucherId: voucher.id } });
      if (alreadyPaid.plus(amount).equals(declaration.declaredAmount)) await tx.taxDeclaration.update({ where: { id }, data: { status: "PAID" } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "TaxDeclaration", resourceId: id, description: "登记税款缴纳", afterData: { amount: amount.toString(), paymentDate: input.paymentDate, paymentReference: input.paymentReference ?? null, voucherId: voucher.id } } });
      return this.getDeclarationFrom(tx, id);
    });
  }

  async accrueSurcharges(periodId: number, actor: { actorId: number; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounting_periods WHERE id = ${periodId} AND deleted_at IS NULL FOR UPDATE`;
      const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, deletedAt: null } });
      if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
      if (period.status !== 0) throw new AppError("PERIOD_CLOSED", "会计期间已关闭，不能生成税费计提凭证", 409);
      const existingEvent = await tx.accountingEvent.findFirst({ where: { eventType: "TAX_SURCHARGE_ACCRUAL", sourceType: "AccountingPeriod", sourceId: periodId, deletedAt: null } });
      if (existingEvent) throw new AppError("SURCHARGE_ALREADY_ACCRUED", "本会计期间已生成附加税费计提凭证", 409);
      const profile = await tx.companyProfile.findFirst({ where: { deletedAt: null } });
      if (!profile || profile.vatFilingPeriod === "UNKNOWN" || profile.urbanMaintenanceRate == null || profile.surchargeReductionEligible === "UNKNOWN") throw new AppError("TAX_PROFILE_INCOMPLETE", "请先完善增值税申报周期、城建税率和附加税减征资格", 409);
      if (profile.vatFilingPeriod === "QUARTER" && period.month % 3 !== 0) throw new AppError("VAT_QUARTER_NOT_CLOSED", "增值税按季申报，请在季度末会计期间计提附加税费", 409);
      const filingPeriod = profile.vatFilingPeriod === "MONTH" ? period.month : Math.ceil(period.month / 3);
      const vatDeclaration = await tx.taxDeclaration.findFirst({
        where: { fiscalYear: period.year, periodType: profile.vatFilingPeriod, period: filingPeriod, taxType: "VAT", deletedAt: null },
      });
      if (!vatDeclaration) throw new AppError("VAT_DECLARATION_REQUIRED", "请先生成并核对本申报期的增值税底稿", 409);
      if (!["REVIEWED", "DECLARED", "PAID"].includes(vatDeclaration.status)) throw new AppError("VAT_DECLARATION_NOT_REVIEWED", "请先复核或申报增值税底稿，再计提附加税费", 409);
      const vatPayable = vatDeclaration.declaredAmount;
      if (vatPayable.lessThanOrEqualTo(ZERO)) {
        throw new AppError("NO_VAT_PAYABLE_FOR_SURCHARGES", "本期无应纳增值税额，无需计提附加税费", 400);
      }

      const reductionFactor = new Prisma.Decimal(1).minus(profile.surchargeReductionEligible === "YES" ? profile.surchargeReductionRate : ZERO);
      const urbanTax = vatPayable.mul(profile.urbanMaintenanceRate).mul(reductionFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const eduTax = vatPayable.mul(profile.educationSurchargeRate).mul(reductionFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const localEduTax = vatPayable.mul(profile.localEducationSurchargeRate).mul(reductionFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const totalSurcharges = urbanTax.plus(eduTax).plus(localEduTax);

      const taxExpenseAcc = await tx.account.findFirst({ where: { code: "6403", deletedAt: null } }) ??
        await tx.account.findFirst({ where: { code: { startsWith: "6403" }, deletedAt: null } });
      const taxPayableAcc = await tx.account.findFirst({ where: { code: { startsWith: "222103" }, deletedAt: null } }) ??
        await tx.account.findFirst({ where: { code: { startsWith: "2221" }, deletedAt: null } });

      if (!taxExpenseAcc || !taxPayableAcc) throw new AppError("ACCOUNT_NOT_FOUND", "未配置税金及附加或附加税应交科目", 400);

      const sequence = await getNextVoucherNumber(tx as any, period.year);
      const summary = `计提${period.periodCode}城建税及附加税费`;
      const voucher = await (tx as any).voucher.create({
        data: {
          ...sequence,
          fiscalYear: period.year,
          fiscalPeriod: period.month,
          voucherDate: period.endDate,
          postingDate: period.endDate,
          periodId: period.id,
          summary,
          sourceType: "MANUAL",
          category: "ACCRUAL",
          status: VOUCHER_STATUS.POSTED,
          totalDebit: totalSurcharges,
          totalCredit: totalSurcharges,
          createdById: actor.actorId,
          reviewerId: actor.actorId,
          reviewedAt: new Date(),
          postedById: actor.actorId,
          postedAt: new Date(),
          entries: {
            create: [
              { lineNo: 1, accountId: taxExpenseAcc.id, summary, debitAmount: totalSurcharges, creditAmount: ZERO },
              { lineNo: 2, accountId: taxPayableAcc.id, summary: "计提城市维护建设税(7%)", debitAmount: ZERO, creditAmount: urbanTax },
              { lineNo: 3, accountId: taxPayableAcc.id, summary: "计提教育费附加(3%)", debitAmount: ZERO, creditAmount: eduTax },
              { lineNo: 4, accountId: taxPayableAcc.id, summary: "计提地方教育附加(2%)", debitAmount: ZERO, creditAmount: localEduTax },
            ],
          },
        },
      });

      await tx.accountingEvent.create({ data: { eventType: "TAX_SURCHARGE_ACCRUAL", sourceType: "AccountingPeriod", sourceId: periodId, voucherId: voucher.id, description: summary, createdById: actor.actorId } });

      return voucher;
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

  private async taxProfile(): Promise<TaxProfile> {
    const profile = await this.prisma.companyProfile.findFirst({ where: { deletedAt: null } });
    if (!profile) throw new AppError("TAX_PROFILE_REQUIRED", "请先完成企业税务设置", 409);
    return profile;
  }

  private assertTaxProfile(type: TaxDeclarationType, period: DeclarationPeriod, profile: TaxProfile) {
    if (type === "VAT" || type === "SURCHARGE") {
      if (profile.vatTaxpayerType === "UNKNOWN" || profile.vatFilingPeriod === "UNKNOWN") {
        throw new AppError("TAX_PROFILE_INCOMPLETE", "请先确认增值税纳税人类型和申报周期", 409);
      }
      if (period.periodType !== profile.vatFilingPeriod) throw new AppError("TAX_PERIOD_MISMATCH", `本企业增值税按${profile.vatFilingPeriod === "MONTH" ? "月" : "季"}申报，请选择对应期间`, 400);
      if (type === "SURCHARGE" && (profile.urbanMaintenanceRate == null || profile.surchargeReductionEligible === "UNKNOWN")) throw new AppError("TAX_PROFILE_INCOMPLETE", "请先设置所在地城建税率，并确认附加税费减征资格", 409);
    }
    if (type === "CORPORATE_INCOME") {
      if (profile.citTaxCollectionMethod === "UNKNOWN" || profile.citFilingPeriod === "UNKNOWN" || profile.smallProfitEnterpriseEligible === "UNKNOWN") {
        throw new AppError("TAX_PROFILE_INCOMPLETE", "请先确认企业所得税征收方式、预缴周期和优惠资格", 409);
      }
      if (profile.citTaxCollectionMethod !== "ACCOUNTING") throw new AppError("ASSESSED_CIT_UNSUPPORTED", "当前简化版仅支持查账征收的企业所得税测算", 409);
      if (period.periodType !== "YEAR" && period.periodType !== profile.citFilingPeriod) throw new AppError("TAX_PERIOD_MISMATCH", `本企业企业所得税按${profile.citFilingPeriod === "MONTH" ? "月" : "季"}预缴，请选择对应期间`, 400);
    }
  }

  private recalculateLines(type: TaxDeclarationType, lines: Array<{ lineCode: string; calculated: Prisma.Decimal; adjustment: Prisma.Decimal; declared: Prisma.Decimal }>) {
    const get = (lineCode: string) => lines.find((line) => line.lineCode === lineCode);
    const setCalculated = (lineCode: string, calculated: Prisma.Decimal) => {
      const line = get(lineCode);
      if (!line) return;
      line.calculated = calculated;
      line.declared = calculated.plus(line.adjustment);
    };
    if (type === "VAT") {
      setCalculated("PAYABLE", Prisma.Decimal.max((get("OUTPUT_TAX")?.declared ?? ZERO).plus(get("DEDUCTIBLE_INPUT_TAX")?.declared ?? ZERO), ZERO).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
    } else if (type === "SURCHARGE") {
      const base = Prisma.Decimal.max(get("VAT_BASE")?.declared ?? ZERO, ZERO);
      const rate = get("SURCHARGE_RATE")?.declared ?? ZERO;
      const surcharge = base.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      setCalculated("SURCHARGE", surcharge);
      setCalculated("PAYABLE", get("SURCHARGE")?.declared ?? surcharge);
    } else {
      const taxableIncome = Prisma.Decimal.max(get("PROFIT_TOTAL")?.declared ?? ZERO, ZERO);
      setCalculated("TAXABLE_INCOME", taxableIncome);
      const rate = get("TAX_RATE")?.declared ?? ZERO;
      const prepaidCredit = get("PREPAID_CREDIT")?.declared ?? ZERO;
      setCalculated("PAYABLE", Prisma.Decimal.max((get("TAXABLE_INCOME")?.declared ?? taxableIncome).mul(rate).plus(prepaidCredit), ZERO).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
    }
  }

  private async buildLines(type: TaxDeclarationType, start: Date, end: Date, profile: TaxProfile, annual = false) {
    const [output, input] = await Promise.all([this.sum("SALE", start, end), this.sum("PURCHASE", start, end)]);
    const deductibleInputTax = profile.vatTaxpayerType === "GENERAL" ? input.deductibleTax : ZERO;
    const vat = output.tax.minus(deductibleInputTax);
    if (type === "VAT") return [
      { lineCode: "OUTPUT_TAX", lineName: "销项税额", calculated: output.tax },
      { lineCode: "DEDUCTIBLE_INPUT_TAX", lineName: "可抵扣进项税额", calculated: deductibleInputTax.negated() },
      { lineCode: "PAYABLE", lineName: "应缴增值税", calculated: Prisma.Decimal.max(vat, ZERO) },
    ];
    if (type === "SURCHARGE") {
      const rate = profile.urbanMaintenanceRate!.plus(profile.educationSurchargeRate).plus(profile.localEducationSurchargeRate);
      const reduction = profile.surchargeReductionEligible === "YES" ? profile.surchargeReductionRate : ZERO;
      const reducedRate = rate.mul(new Prisma.Decimal(1).minus(reduction));
      const base = Prisma.Decimal.max(vat, ZERO);
      const payable = base.mul(reducedRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return [
        { lineCode: "VAT_BASE", lineName: "增值税计税依据估算", calculated: base },
        { lineCode: "SURCHARGE_RATE", lineName: "附加税费合计适用率", calculated: reducedRate },
        { lineCode: "SURCHARGE", lineName: "附加税费测算", calculated: payable },
        { lineCode: "PAYABLE", lineName: "应缴附加税费", calculated: payable },
      ];
    }

    let totalProfit = ZERO;
    const ytdStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    const pnlEntries = await this.prisma.voucherEntry.groupBy({
      by: ["accountId"],
      where: {
        deletedAt: null,
        voucher: { postingDate: { gte: ytdStart, lte: end }, status: VOUCHER_STATUS.POSTED, deletedAt: null },
        account: { category: "PROFIT_AND_LOSS", deletedAt: null, code: { not: { startsWith: "6801" } } },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    for (const entry of pnlEntries) totalProfit = totalProfit.plus((entry._sum.creditAmount ?? ZERO).minus(entry._sum.debitAmount ?? ZERO));
    const taxableProfit = Prisma.Decimal.max(ZERO, totalProfit);
    const isSmall = profile.smallProfitEnterpriseEligible === "YES" && taxableProfit.lessThanOrEqualTo(new Prisma.Decimal(3000000));
    const rate = new Prisma.Decimal(isSmall ? "0.05" : "0.25");
    const priorDeclarations = await this.prisma.taxDeclaration.findMany({
      where: {
        taxType: "CORPORATE_INCOME",
        fiscalYear: end.getUTCFullYear(),
        deletedAt: null,
        periodEnd: annual ? { lte: end } : { lt: start },
      },
      include: { payments: { where: { paymentDate: { lte: end } } } },
    });
    const prepaid = priorDeclarations.reduce((sum, row) => sum.plus(row.payments.reduce((paid, payment) => paid.plus(payment.amount), ZERO)), ZERO);
    const payable = Prisma.Decimal.max(taxableProfit.mul(rate).minus(prepaid), ZERO).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return [
      { lineCode: "PROFIT_TOTAL", lineName: "利润总额（本年累计估算）", calculated: totalProfit },
      { lineCode: "TAXABLE_INCOME", lineName: "应纳税所得额估算", calculated: taxableProfit },
      { lineCode: "TAX_RATE", lineName: isSmall ? "适用税率估算（小型微利企业优惠）" : "适用税率估算", calculated: rate },
      { lineCode: "PREPAID_CREDIT", lineName: "本年度已登记缴款", calculated: prepaid.negated() },
      { lineCode: "PAYABLE", lineName: annual ? "企业所得税年度应补（退）测算" : "企业所得税本期预缴测算", calculated: payable },
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
