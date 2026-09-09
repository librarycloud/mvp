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

  async generateCashFlowIndirect(period: ReportPeriodInput) {
    const dates = await this.periodDates(period);
    const accounts = await this.repository.listAccounts();
    const earliest = new Date(1900, 0, 1);
    const openingEnd = new Date(dates.start.getTime() - 1);

    const [openingTotals, currentTotals, closingTotals] = await Promise.all([
      this.repository.aggregateEntries(earliest, openingEnd),
      this.repository.aggregateEntries(dates.start, dates.end),
      this.repository.aggregateEntries(earliest, dates.end),
    ]);

    const opMap = new Map(openingTotals.map((t) => [t.accountId, t]));
    const curMap = new Map(currentTotals.map((t) => [t.accountId, t]));
    const clMap = new Map(closingTotals.map((t) => [t.accountId, t]));

    const getBalances = (codePrefixes: string[]) => {
      let openingBalance = new Prisma.Decimal(0);
      let closingBalance = new Prisma.Decimal(0);
      let debitMovement = new Prisma.Decimal(0);
      let creditMovement = new Prisma.Decimal(0);

      for (const a of accounts) {
        if (!a.code || !codePrefixes.some((p) => a.code!.startsWith(p))) continue;
        const op = opMap.get(a.id);
        const cur = curMap.get(a.id);
        const cl = clMap.get(a.id);

        const opD = new Prisma.Decimal(op?.debit ?? "0");
        const opC = new Prisma.Decimal(op?.credit ?? "0");
        const clD = new Prisma.Decimal(cl?.debit ?? "0");
        const clC = new Prisma.Decimal(cl?.credit ?? "0");
        const curD = new Prisma.Decimal(cur?.debit ?? "0");
        const curC = new Prisma.Decimal(cur?.credit ?? "0");

        debitMovement = debitMovement.plus(curD);
        creditMovement = creditMovement.plus(curC);

        if (a.normalDirection === "DEBIT") {
          openingBalance = openingBalance.plus(opD.minus(opC));
          closingBalance = closingBalance.plus(clD.minus(clC));
        } else {
          openingBalance = openingBalance.plus(opC.minus(opD));
          closingBalance = closingBalance.plus(clC.minus(clD));
        }
      }
      return { openingBalance, closingBalance, debitMovement, creditMovement };
    };

    let netProfit = new Prisma.Decimal(0);
    for (const a of accounts) {
      if (a.category !== "PROFIT_AND_LOSS") continue;
      const cur = curMap.get(a.id);
      if (!cur) continue;
      const curD = new Prisma.Decimal(cur.debit ?? "0");
      const curC = new Prisma.Decimal(cur.credit ?? "0");
      if (a.normalDirection === "CREDIT") {
        netProfit = netProfit.plus(curC.minus(curD));
      } else {
        netProfit = netProfit.minus(curD.minus(curC));
      }
    }

    const impairment = getBalances(["6701", "6702", "1231"]);
    const impairmentAmount = impairment.debitMovement.minus(impairment.creditMovement);
    const depr = getBalances(["1602"]);
    const deprAmount = depr.creditMovement.minus(depr.debitMovement);
    const amort = getBalances(["1702", "1801"]);
    const amortAmount = amort.creditMovement.minus(amort.debitMovement);
    const disposal = getBalances(["6115"]);
    const disposalAmount = disposal.debitMovement.minus(disposal.creditMovement);
    const finExpense = getBalances(["6603"]);
    const finAmount = finExpense.debitMovement.minus(finExpense.creditMovement);
    const invest = getBalances(["6111"]);
    const investLossAmount = invest.debitMovement.minus(invest.creditMovement);
    const inv = getBalances(["14"]);
    const invDecrease = inv.openingBalance.minus(inv.closingBalance);
    const rec = getBalances(["1122", "1123", "1221"]);
    const recDecrease = rec.openingBalance.minus(rec.closingBalance);
    const pay = getBalances(["2202", "2203", "2211", "2221", "2241"]);
    const payIncrease = pay.closingBalance.minus(pay.openingBalance);

    const netOperatingCashFlow = netProfit
      .plus(impairmentAmount)
      .plus(deprAmount)
      .plus(amortAmount)
      .plus(disposalAmount)
      .plus(finAmount)
      .plus(investLossAmount)
      .plus(invDecrease)
      .plus(recDecrease)
      .plus(payIncrease);

    const items = [
      { lineNo: 1, itemCode: "NET_PROFIT", name: "净利润", amount: netProfit.toFixed(2), note: "基于当期损益类科目发生额" },
      { lineNo: 2, itemCode: "ASSET_IMPAIRMENT", name: "加：资产减值准备与信用减值损失", amount: impairmentAmount.toFixed(2), note: "科目 6701/6702/1231 发生额" },
      { lineNo: 3, itemCode: "FIXED_ASSET_DEPR", name: "固定资产折旧", amount: deprAmount.toFixed(2), note: "科目 1602 累计折旧贷方净额" },
      { lineNo: 4, itemCode: "AMORTIZATION", name: "无形资产与长期待摊费用摊销", amount: amortAmount.toFixed(2), note: "科目 1702/1801 摊销净额" },
      { lineNo: 5, itemCode: "DISPOSAL_LOSS", name: "处置固定资产、无形资产和其他长期资产的损失（减：收益）", amount: disposalAmount.toFixed(2), note: "科目 6115 净额" },
      { lineNo: 6, itemCode: "FINANCIAL_EXPENSE", name: "财务费用（利息支出）", amount: finAmount.toFixed(2), note: "科目 6603 发生额" },
      { lineNo: 7, itemCode: "INVESTMENT_LOSS", name: "投资损失（减：收益）", amount: investLossAmount.toFixed(2), note: "科目 6111 净额" },
      { lineNo: 8, itemCode: "INVENTORY_DECREASE", name: "存货的减少（减：增加）", amount: invDecrease.toFixed(2), note: "存货类 14xx 科目期初减期末" },
      { lineNo: 9, itemCode: "OPERATING_REC_DECREASE", name: "经营性应收项目的减少（减：增加）", amount: recDecrease.toFixed(2), note: "往来应收类科目期初减期末" },
      { lineNo: 10, itemCode: "OPERATING_PAY_INCREASE", name: "经营性应付项目的增加（减：减少）", amount: payIncrease.toFixed(2), note: "经营应付类科目期末减期初" },
      { lineNo: 11, itemCode: "NET_OPERATING_CASH_FLOW", name: "经营活动产生的现金流量净额", amount: netOperatingCashFlow.toFixed(2), note: "净利润与各项调节项目代数和" },
    ];

    return {
      period,
      periodStart: dates.start.toISOString().slice(0, 10),
      periodEnd: dates.end.toISOString().slice(0, 10),
      items,
      netOperatingCashFlow: netOperatingCashFlow.toFixed(2),
    };
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

  async drillDown(reportId: number, reportItemId: number) {
    const report = await this.getReport(reportId);
    const line = (report as any).lines?.find(
      (l: any) => l.reportItemId === reportItemId || l.reportItem?.id === reportItemId,
    );
    if (!line) throw new AppError("REPORT_ITEM_NOT_FOUND", "未找到对应的报表项目", 404);

    const mappings = line.reportItem?.accountMappings ?? [];
    const periodStart = new Date((report as any).periodStart);
    const periodEnd = new Date((report as any).periodEnd);
    const openingEnd = new Date(periodStart.getTime() - 1);
    const earliest = new Date(1900, 0, 1);

    const [openingTotals, periodTotals] = await Promise.all([
      this.repository.aggregateEntries(earliest, openingEnd),
      this.repository.aggregateEntries(periodStart, periodEnd),
    ]);

    const openingMap = new Map(openingTotals.map((t) => [t.accountId, t]));
    const periodMap = new Map(periodTotals.map((t) => [t.accountId, t]));

    const accounts = mappings.map((m: any) => {
      const acc = m.account ?? { id: m.accountId, code: `Account-${m.accountId}`, name: `科目-${m.accountId}` };
      const op = openingMap.get(m.accountId);
      const pr = periodMap.get(m.accountId);
      const opDebit = new Prisma.Decimal(op?.debit ?? 0);
      const opCredit = new Prisma.Decimal(op?.credit ?? 0);
      const prDebit = new Prisma.Decimal(pr?.debit ?? 0);
      const prCredit = new Prisma.Decimal(pr?.credit ?? 0);
      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        operator: m.operator,
        valueType: m.valueType,
        openingDebit: opDebit.toString(),
        openingCredit: opCredit.toString(),
        periodDebit: prDebit.toString(),
        periodCredit: prCredit.toString(),
        closingDebit: opDebit.plus(prDebit).toString(),
        closingCredit: opCredit.plus(prCredit).toString(),
      };
    });

    return {
      reportId: (report as any).id,
      reportName: (report as any).template?.name ?? "财务报表",
      periodStart: (report as any).periodStart,
      periodEnd: (report as any).periodEnd,
      item: {
        id: line.reportItem?.id ?? reportItemId,
        itemCode: line.reportItem?.itemCode ?? "",
        name: line.reportItem?.name ?? "",
        lineNumber: line.reportItem?.lineNumber ?? null,
        openingAmount: line.openingAmount,
        currentAmount: line.currentAmount,
        closingAmount: line.closingAmount,
        calculationTrace: line.calculationTrace,
      },
      accounts,
    };
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
