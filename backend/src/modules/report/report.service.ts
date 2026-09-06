import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import type { PersistReportLine, ReportRepository } from "./report.repository.js";
import type {
  ReportAccount,
  ReportAccountTotal,
  ReportCashCounterpartyTotal,
  ReportMapping,
  ReportPeriodInput,
  ReportTemplateDefinition,
} from "./report.types.js";

export const INCOME_STATEMENT_TEMPLATE_CODE = "INCOME_STATEMENT_CN_ASBE_V1";
export const BALANCE_SHEET_TEMPLATE_CODE = "BALANCE_SHEET_CN_ASBE_V1";
export const CASH_FLOW_STATEMENT_TEMPLATE_CODE = "CASH_FLOW_STATEMENT_CN_ASBE_V1";
export const EQUITY_CHANGE_STATEMENT_TEMPLATE_CODE = "EQUITY_CHANGE_STATEMENT_CN_ASBE_V1";

interface CalculatedItem {
  value: Prisma.Decimal;
  trace: Record<string, unknown>;
}

interface ReportPeriodDates {
  start: Date;
  end: Date;
  yearStart: Date;
}

export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  async generateIncomeStatement(period: ReportPeriodInput, generatedById: number) {
    return this.generate(INCOME_STATEMENT_TEMPLATE_CODE, period, generatedById, "INCOME_STATEMENT");
  }

  async generate(
    templateCode: string,
    period: ReportPeriodInput,
    generatedById: number,
    expectedType?: ReportTemplateDefinition["type"],
  ) {
    const dates = await this.periodDates(period);
    const template = await this.repository.findActiveTemplate(templateCode);
    if (!template) {
      throw new AppError("REPORT_TEMPLATE_NOT_FOUND", "未找到已启用的利润表模板，请先初始化报表配置", 409);
    }
    if (expectedType && template.type !== expectedType) {
      throw new AppError("REPORT_TEMPLATE_INVALID", "利润表模板类型不正确", 409);
    }
    const accounts = await this.repository.listAccounts();
    this.validateTemplate(template, accounts);
    const lines = template.type === "BALANCE_SHEET"
      ? await this.balanceSheetLines(template, accounts, dates.start, dates.end)
      : template.type === "CASH_FLOW_STATEMENT"
        ? await this.cashFlowLines(template, accounts, dates.start, dates.end)
        : template.type === "EQUITY_CHANGE_STATEMENT"
          ? await this.equityChangeLines(template, accounts, dates, await this.periodDates({ ...period, fiscalYear: period.fiscalYear - 1 }, false))
        : await this.incomeLines(template, accounts, dates.yearStart, dates.start, dates.end);
    return this.repository.saveReport({
      templateId: template.id, period, periodStart: dates.start, periodEnd: dates.end, generatedById, lines,
    });
  }

  async generateBalanceSheet(period: ReportPeriodInput, generatedById: number) {
    return this.generate(BALANCE_SHEET_TEMPLATE_CODE, period, generatedById, "BALANCE_SHEET");
  }

  async generateCashFlowStatement(period: ReportPeriodInput, generatedById: number) {
    return this.generate(CASH_FLOW_STATEMENT_TEMPLATE_CODE, period, generatedById, "CASH_FLOW_STATEMENT");
  }

  async generateEquityChangeStatement(period: ReportPeriodInput, generatedById: number) {
    return this.generate(EQUITY_CHANGE_STATEMENT_TEMPLATE_CODE, period, generatedById, "EQUITY_CHANGE_STATEMENT");
  }

  async getReport(id: number) {
    const report = await this.repository.findReportById(id);
    if (!report) throw new AppError("REPORT_NOT_FOUND", "报表不存在", 404);
    return report;
  }

  async listReports(page = 1, pageSize = 20) {
    const normalizedPage = Math.max(page, 1);
    const normalizedPageSize = Math.min(Math.max(pageSize, 1), 200);
    const result = await this.repository.listReports?.(normalizedPage, normalizedPageSize) ?? { items: [], total: 0 };
    return { ...result, page: normalizedPage, pageSize: normalizedPageSize, totalPages: Math.ceil(result.total / normalizedPageSize) };
  }

  private calculate(
    template: ReportTemplateDefinition,
    accounts: ReportAccount[],
    totals: ReportAccountTotal[],
    mode: "ALL" | "MOVEMENT" | "BALANCE" = "ALL",
    cashTotals?: ReportCashCounterpartyTotal[],
    fixedValues?: Map<number, Prisma.Decimal>,
    itemAdjustments?: Map<number, Prisma.Decimal>,
  ): Map<number, CalculatedItem> {
    const direct = new Map(totals.map((total) => [total.accountId, total]));
    const children = new Map<number, number[]>();
    for (const account of accounts) {
      if (!account.parentId) continue;
      children.set(account.parentId, [...(children.get(account.parentId) ?? []), account.id]);
    }
    const values = new Map<number, CalculatedItem>();
    const pending = new Map(template.items.map((item) => [item.id, item]));
    while (pending.size) {
      let progressed = false;
      for (const [itemId, item] of pending) {
        if (item.dependencies.some((dependency) => !values.has(dependency.sourceItemId))) continue;
        let value = new Prisma.Decimal(0);
        const mappingTrace: Array<Record<string, string>> = [];
        for (const mapping of item.mappings) {
          const mappingValue = this.mappingValue(mapping, accounts, children, direct, mode, cashTotals);
          value = mapping.operator === "ADD" ? value.plus(mappingValue) : value.minus(mappingValue);
          mappingTrace.push({ accountId: String(mapping.accountId), operator: mapping.operator, value: mappingValue.toString() });
        }
        const formulaTrace: Array<Record<string, string>> = [];
        for (const dependency of item.dependencies) {
          const dependencyValue = values.get(dependency.sourceItemId)!.value.mul(dependency.coefficient);
          value = dependency.operator === "ADD" ? value.plus(dependencyValue) : value.minus(dependencyValue);
          formulaTrace.push({ sourceItemId: String(dependency.sourceItemId), operator: dependency.operator, value: dependencyValue.toString() });
        }
        const adjustment = itemAdjustments?.get(item.id);
        if (adjustment) {
          value = value.plus(adjustment);
          mappingTrace.push({ unclosedProfitLossAdjustment: adjustment.toString() });
        }
        const fixedValue = fixedValues?.get(item.id);
        if (fixedValue) {
          value = fixedValue;
          mappingTrace.push({ fixedValue: fixedValue.toString() });
        }
        values.set(itemId, { value, trace: { mappings: mappingTrace, dependencies: formulaTrace } });
        pending.delete(itemId);
        progressed = true;
      }
      if (!progressed) {
        throw new AppError("REPORT_TEMPLATE_CYCLE", "报表模板公式存在循环依赖或无效引用", 409);
      }
    }
    return values;
  }

  private async incomeLines(
    template: ReportTemplateDefinition,
    accounts: ReportAccount[],
    fiscalYearStart: Date,
    start: Date,
    end: Date,
  ): Promise<PersistReportLine[]> {
    const [currentTotals, yearToDateTotals] = await Promise.all([
      this.repository.aggregateEntries(start, end),
      this.repository.aggregateEntries(fiscalYearStart, end),
    ]);
    const current = this.calculate(template, accounts, currentTotals);
    const yearToDate = this.calculate(template, accounts, yearToDateTotals);
    return template.items.map((item) => ({
      reportItemId: item.id,
      openingAmount: null,
      currentAmount: this.reportAmount(current.get(item.id)?.value),
      closingAmount: this.reportAmount(yearToDate.get(item.id)?.value),
      calculationTrace: { current: current.get(item.id)?.trace ?? {}, yearToDate: yearToDate.get(item.id)?.trace ?? {} },
    }));
  }

  private async balanceSheetLines(
    template: ReportTemplateDefinition,
    accounts: ReportAccount[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PersistReportLine[]> {
    const earliest = new Date(1900, 0, 1);
    const openingEnd = new Date(periodStart.getTime() - 1);
    const [openingTotals, closingTotals] = await Promise.all([
      this.repository.aggregateEntries(earliest, openingEnd),
      this.repository.aggregateEntries(earliest, periodEnd),
    ]);

    const profitLossAccounts = new Set(accounts.filter((a) => a.category === "PROFIT_AND_LOSS").map((a) => a.id));
    const computeUnclosedProfitLoss = (totals: ReportAccountTotal[]) => {
      let sum = new Prisma.Decimal(0);
      for (const total of totals) {
        if (profitLossAccounts.has(total.accountId)) {
          sum = sum.plus(new Prisma.Decimal(total.credit).minus(total.debit));
        }
      }
      return sum;
    };

    const currentProfitItem = template.items.find((item) => item.itemCode === "CURRENT_PROFIT");
    const openingAdjustments = new Map<number, Prisma.Decimal>();
    const closingAdjustments = new Map<number, Prisma.Decimal>();
    if (currentProfitItem && profitLossAccounts.size > 0) {
      const openingUnclosed = computeUnclosedProfitLoss(openingTotals);
      const closingUnclosed = computeUnclosedProfitLoss(closingTotals);
      if (!openingUnclosed.isZero()) openingAdjustments.set(currentProfitItem.id, openingUnclosed);
      if (!closingUnclosed.isZero()) closingAdjustments.set(currentProfitItem.id, closingUnclosed);
    }

    const opening = this.calculate(template, accounts, openingTotals, "ALL", undefined, undefined, openingAdjustments);
    const closing = this.calculate(template, accounts, closingTotals, "ALL", undefined, undefined, closingAdjustments);

    const totalAssetsItem = template.items.find((item) => item.itemCode === "TOTAL_ASSETS");
    const totalLiabilitiesAndEquityItem = template.items.find((item) => item.itemCode === "TOTAL_LIABILITIES_AND_EQUITY");
    if (totalAssetsItem && totalLiabilitiesAndEquityItem) {
      const assets = closing.get(totalAssetsItem.id)?.value ?? new Prisma.Decimal(0);
      const liabilitiesAndEquity = closing.get(totalLiabilitiesAndEquityItem.id)?.value ?? new Prisma.Decimal(0);
      const diff = assets.minus(liabilitiesAndEquity).abs();
      if (diff.greaterThan(new Prisma.Decimal("0.05"))) {
        throw new AppError("REPORT_BALANCE_SHEET_UNBALANCED", `资产负债表期末不平衡：资产总计 ${assets.toString()}，负债和所有者权益总计 ${liabilitiesAndEquity.toString()}，差额 ${diff.toString()}`, 409, {
          totalAssets: assets.toString(),
          totalLiabilitiesAndEquity: liabilitiesAndEquity.toString(),
          difference: diff.toString(),
        });
      }
    }

    return template.items.map((item) => ({
      reportItemId: item.id,
      openingAmount: this.reportAmount(opening.get(item.id)?.value),
      currentAmount: null,
      closingAmount: this.reportAmount(closing.get(item.id)?.value),
      calculationTrace: { opening: opening.get(item.id)?.trace ?? {}, closing: closing.get(item.id)?.trace ?? {} },
    }));
  }

  private async cashFlowLines(
    template: ReportTemplateDefinition,
    accounts: ReportAccount[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PersistReportLine[]> {
    const earliest = new Date(1900, 0, 1);
    const [openingTotals, currentTotals, closingTotals] = await Promise.all([
      this.repository.aggregateEntries(earliest, new Date(periodStart.getTime() - 1)),
      this.repository.aggregateEntries(periodStart, periodEnd),
      this.repository.aggregateEntries(earliest, periodEnd),
    ]);
    const opening = this.calculate(template, accounts, openingTotals, "BALANCE");
    const closing = this.calculate(template, accounts, closingTotals, "BALANCE");
    const byCode = new Map(template.items.map((item) => [item.itemCode, item]));
    const usesDirectMappings = template.items.some((item) => item.mappings.some((mapping) => mapping.valueType === "CASH_INFLOW" || mapping.valueType === "CASH_OUTFLOW"));
    const cashAccountIds = usesDirectMappings ? this.cashAccountIds(template, accounts, byCode) : [];
    const cashCounterparties = usesDirectMappings ? await this.repository.aggregateCashCounterparties(periodStart, periodEnd, cashAccountIds) : [];
    const classifiedCurrent = this.calculate(template, accounts, currentTotals, "MOVEMENT", cashCounterparties);
    const actualInflow = cashCounterparties.reduce((sum, item) => sum.plus(item.inflow), new Prisma.Decimal(0));
    const actualOutflow = cashCounterparties.reduce((sum, item) => sum.plus(item.outflow), new Prisma.Decimal(0));
    const classified = template.items.reduce((sum, item) => {
      const value = classifiedCurrent.get(item.id)?.value ?? new Prisma.Decimal(0);
      if (item.mappings.some((mapping) => mapping.valueType === "CASH_INFLOW")) sum.inflow = sum.inflow.plus(value);
      if (item.mappings.some((mapping) => mapping.valueType === "CASH_OUTFLOW")) sum.outflow = sum.outflow.plus(value);
      return sum;
    }, { inflow: new Prisma.Decimal(0), outflow: new Prisma.Decimal(0) });
    const otherInflow = byCode.get("OPERATING_OTHER_INFLOW");
    const otherOutflow = byCode.get("OPERATING_OTHER_OUTFLOW");
    if (usesDirectMappings && (!otherInflow || !otherOutflow)) throw new AppError("REPORT_CASH_FLOW_TEMPLATE_INVALID", "直接法现金流量表必须配置其他经营活动现金流入和流出项目", 409);
    const adjustments = new Map<number, Prisma.Decimal>([
      ...(otherInflow ? [[otherInflow.id, actualInflow.minus(classified.inflow)] as [number, Prisma.Decimal]] : []),
      ...(otherOutflow ? [[otherOutflow.id, actualOutflow.minus(classified.outflow)] as [number, Prisma.Decimal]] : []),
    ]);
    const current = this.calculate(template, accounts, currentTotals, "MOVEMENT", cashCounterparties, adjustments);
    const netIncrease = byCode.get("NET_INCREASE_CASH");
    const beginning = byCode.get("CASH_BEGINNING");
    const ending = byCode.get("CASH_ENDING");
    if (netIncrease || beginning || ending) {
      if (!netIncrease || !beginning || !ending) {
        throw new AppError("REPORT_CASH_FLOW_TEMPLATE_INVALID", "现金流量表必须同时配置现金净增加额、期初现金和期末现金项目", 409);
      }
      const difference = (closing.get(ending.id)?.value ?? new Prisma.Decimal(0))
        .minus(opening.get(beginning.id)?.value ?? new Prisma.Decimal(0));
      if (!usesDirectMappings) {
        const legacyExpected = current.get(netIncrease.id)?.value ?? new Prisma.Decimal(0);
        if (!difference.equals(legacyExpected)) {
          const operating = byCode.get("NET_CASH_OPERATING");
          if (operating) {
            const operatingValue = current.get(operating.id)?.value ?? new Prisma.Decimal(0);
            current.set(operating.id, { value: operatingValue.plus(difference.minus(legacyExpected)), trace: { ...(current.get(operating.id)?.trace ?? {}), cashReconciliationAdjustment: { adjustment: difference.minus(legacyExpected).toString() } } });
          }
          current.set(netIncrease.id, { value: difference, trace: { ...(current.get(netIncrease.id)?.trace ?? {}), cashReconciliation: { cashBalanceDifference: difference.toString() } } });
        }
      }
      const expected = current.get(netIncrease.id)?.value ?? new Prisma.Decimal(0);
      if (!difference.equals(expected)) {
        throw new AppError("REPORT_CASH_FLOW_UNBALANCED", "直接法现金流量与现金余额变动不一致，请检查现金科目配置和已记账凭证", 409, { cashBalanceDifference: difference.toString(), netCashIncrease: expected.toString() });
      }
    }
    return template.items.map((item) => ({
      reportItemId: item.id,
      openingAmount: this.reportAmount(opening.get(item.id)?.value),
      currentAmount: this.reportAmount(current.get(item.id)?.value),
      closingAmount: this.reportAmount(closing.get(item.id)?.value),
      calculationTrace: { opening: opening.get(item.id)?.trace ?? {}, current: current.get(item.id)?.trace ?? {}, closing: closing.get(item.id)?.trace ?? {} },
    }));
  }

  private async equityChangeLines(
    template: ReportTemplateDefinition,
    accounts: ReportAccount[],
    currentPeriod: ReportPeriodDates,
    previousPeriod: ReportPeriodDates | null,
  ): Promise<PersistReportLine[]> {
    const earliest = new Date(1900, 0, 1);
    const [currentOpeningTotals, currentMovementTotals, previousOpeningTotals, previousMovementTotals] = await Promise.all([
      this.repository.aggregateEntries(earliest, new Date(currentPeriod.start.getTime() - 1)),
      this.repository.aggregateEntries(currentPeriod.start, currentPeriod.end),
      previousPeriod ? this.repository.aggregateEntries(earliest, new Date(previousPeriod.start.getTime() - 1)) : Promise.resolve([]),
      previousPeriod ? this.repository.aggregateEntries(previousPeriod.start, previousPeriod.end) : Promise.resolve([]),
    ]);
    const buckets = {
      CY_OPEN: this.calculate(template, accounts, currentOpeningTotals),
      CY_CHANGE: this.calculate(template, accounts, currentMovementTotals),
      PY_OPEN: this.calculate(template, accounts, previousOpeningTotals),
      PY_CHANGE: this.calculate(template, accounts, previousMovementTotals),
    } as const;
    return template.items.map((item) => {
      const bucket = (Object.keys(buckets) as Array<keyof typeof buckets>).find((prefix) => item.itemCode.startsWith(`${prefix}_`));
      const calculated = bucket ? buckets[bucket].get(item.id) : undefined;
      return { reportItemId: item.id, openingAmount: null, currentAmount: this.reportAmount(calculated?.value), closingAmount: null, calculationTrace: calculated?.trace ?? {} };
    });
  }

  private reportAmount(value?: Prisma.Decimal): string {
    return (value ?? new Prisma.Decimal(0))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toString();
  }

  private validateTemplate(template: ReportTemplateDefinition, accounts: ReportAccount[]): void {
    const accountIds = new Set(accounts.map((account) => account.id));
    const itemIds = new Set(template.items.map((item) => item.id));
    for (const item of template.items) {
      if (item.mappings.some((mapping) => !accountIds.has(mapping.accountId))) {
        throw new AppError("REPORT_TEMPLATE_INVALID", `报表项目 ${item.itemCode} 引用了不存在的科目`, 409);
      }
      if (item.dependencies.some((dependency) => !itemIds.has(dependency.sourceItemId))) {
        throw new AppError("REPORT_TEMPLATE_INVALID", `报表项目 ${item.itemCode} 引用了不存在的公式项目`, 409);
      }
    }
    if (template.type === "CASH_FLOW_STATEMENT") {
      const codes = new Set(template.items.map((item) => item.itemCode));
      const governed = ["NET_INCREASE_CASH", "CASH_BEGINNING", "CASH_ENDING"].some((code) => codes.has(code));
      if (governed && !["NET_INCREASE_CASH", "CASH_BEGINNING", "CASH_ENDING"].every((code) => codes.has(code))) {
        throw new AppError("REPORT_CASH_FLOW_TEMPLATE_INVALID", "现金流量表缺少标准勾稽项目", 409);
      }
    }
  }

  private mappingValue(
    mapping: ReportMapping,
    accounts: ReportAccount[],
    children: Map<number, number[]>,
    totals: Map<number, ReportAccountTotal>,
    mode: "ALL" | "MOVEMENT" | "BALANCE" = "ALL",
    cashTotals?: ReportCashCounterpartyTotal[],
  ): Prisma.Decimal {
    const movement = new Set(["PERIOD_DEBIT", "PERIOD_CREDIT", "PERIOD_NET", "YEAR_TO_DATE_DEBIT", "YEAR_TO_DATE_CREDIT", "YEAR_TO_DATE_NET"]);
    const balance = new Set(["OPENING_BALANCE", "CLOSING_BALANCE"]);
    if (mapping.valueType === "CASH_INFLOW" || mapping.valueType === "CASH_OUTFLOW") {
      if (mode !== "MOVEMENT") return new Prisma.Decimal(0);
      const ids = mapping.includeChildren ? this.descendants(mapping.accountId, children) : new Set([mapping.accountId]);
      return (cashTotals ?? []).reduce((sum, item) => ids.has(item.accountId) ? sum.plus(mapping.valueType === "CASH_INFLOW" ? item.inflow : item.outflow) : sum, new Prisma.Decimal(0));
    }
    if ((mode === "MOVEMENT" && !movement.has(mapping.valueType)) || (mode === "BALANCE" && !balance.has(mapping.valueType))) {
      return new Prisma.Decimal(0);
    }
    const ids = mapping.includeChildren
      ? this.descendants(mapping.accountId, children)
      : new Set([mapping.accountId]);
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const id of ids) {
      const total = totals.get(id);
      if (!total) continue;
      debit = debit.plus(total.debit);
      credit = credit.plus(total.credit);
    }
    switch (mapping.valueType) {
      case "PERIOD_DEBIT":
      case "YEAR_TO_DATE_DEBIT":
        return debit;
      case "PERIOD_CREDIT":
      case "YEAR_TO_DATE_CREDIT":
        return credit;
      case "PERIOD_NET":
      case "YEAR_TO_DATE_NET":
      case "OPENING_BALANCE":
      case "CLOSING_BALANCE": {
        const net = mapping.direction === "CREDIT" ? credit.minus(debit) : debit.minus(credit);
        return net;
      }
      default:
        throw new AppError("REPORT_MAPPING_INVALID", "报表映射类型无效", 409);
    }
  }

  private descendants(id: number, children: Map<number, number[]>): Set<number> {
    const result = new Set<number>([id]);
    const queue = [id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const child of children.get(current) ?? []) {
        if (result.has(child)) continue;
        result.add(child);
        queue.push(child);
      }
    }
    return result;
  }

  private cashAccountIds(template: ReportTemplateDefinition, accounts: ReportAccount[], byCode: Map<string, ReportTemplateDefinition["items"][number]>): number[] {
    const cashItems = [byCode.get("CASH_BEGINNING"), byCode.get("CASH_ENDING")].filter((item): item is ReportTemplateDefinition["items"][number] => Boolean(item));
    const children = new Map<number, number[]>();
    for (const account of accounts) if (account.parentId) children.set(account.parentId, [...(children.get(account.parentId) ?? []), account.id]);
    const ids = new Set<number>();
    for (const item of cashItems) {
      for (const mapping of item.mappings.filter((mapping) => mapping.valueType === "CLOSING_BALANCE" || mapping.valueType === "OPENING_BALANCE")) {
        for (const accountId of mapping.includeChildren ? this.descendants(mapping.accountId, children) : [mapping.accountId]) ids.add(accountId);
      }
    }
    if (!ids.size) throw new AppError("REPORT_CASH_FLOW_TEMPLATE_INVALID", "直接法现金流量表未配置现金及现金等价物科目", 409);
    return [...ids];
  }

  private async periodDates(period: ReportPeriodInput, required?: true): Promise<ReportPeriodDates>;
  private async periodDates(period: ReportPeriodInput, required: false): Promise<ReportPeriodDates | null>;
  private async periodDates(period: ReportPeriodInput, required = true): Promise<ReportPeriodDates | null> {
    if (period.fiscalYear < 2000 || period.fiscalYear > 9999) {
      if (!required) return null;
      throw new AppError("INVALID_REPORT_PERIOD", "财务年度无效", 400);
    }
    const max = period.periodType === "MONTH" ? 12 : period.periodType === "QUARTER" ? 4 : 0;
    if (period.periodType !== "YEAR" && (!period.period || period.period < 1 || period.period > max)) {
      throw new AppError("INVALID_REPORT_PERIOD", "报表期间无效", 400);
    }
    const periods = await this.repository.listAccountingPeriods(period.fiscalYear);
    const configuredMonths = periods
      .map((item) => item.month)
      .filter((month) => month >= 1 && month <= 12);
    const requestedStartMonth = period.periodType === "YEAR" ? 1 : period.periodType === "MONTH" ? period.period! : (period.period! - 1) * 3 + 1;
    const requestedEndMonth = period.periodType === "YEAR" ? 12 : period.periodType === "MONTH" ? requestedStartMonth : requestedStartMonth + 2;
    const firstConfiguredMonth = Math.min(...configuredMonths);
    const startMonth = period.periodType === "YEAR"
      ? firstConfiguredMonth
      : period.periodType === "QUARTER" && firstConfiguredMonth > requestedStartMonth && firstConfiguredMonth <= requestedEndMonth
        ? firstConfiguredMonth
        : requestedStartMonth;
    const endMonth = period.periodType === "YEAR" ? Math.max(...configuredMonths) : requestedEndMonth;
    if (!Number.isFinite(startMonth) || !Number.isFinite(endMonth)) {
      if (!required) return null;
      throw new AppError("REPORT_ACCOUNTING_PERIOD_NOT_FOUND", "所选范围尚未配置会计期间", 409);
    }
    const selected = periods.filter((item) => item.month >= startMonth && item.month <= endMonth);
    const expectedMonths = Array.from({ length: endMonth - startMonth + 1 }, (_, index) => startMonth + index);
    const selectedMonths = new Set(selected.map((item) => item.month));
    if (selected.length !== expectedMonths.length || expectedMonths.some((month) => !selectedMonths.has(month))) {
      if (!required) return null;
      throw new AppError("REPORT_ACCOUNTING_PERIOD_NOT_FOUND", "所选范围尚未配置会计期间", 409);
    }
    const yearToDate = periods.filter((item) => item.month <= endMonth);
    return {
      start: new Date(Math.min(...selected.map((item) => item.startDate.getTime()))),
      end: new Date(Math.max(...selected.map((item) => item.endDate.getTime()))),
      yearStart: new Date(Math.min(...yearToDate.map((item) => item.startDate.getTime()))),
    };
  }
}
