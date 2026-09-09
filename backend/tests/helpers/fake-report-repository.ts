import type { PersistReportLine, ReportRepository } from "../../src/modules/report/report.repository.js";
import type {
  ReportAccount,
  ReportAccountTotal,
  ReportCashCounterpartyTotal,
  ReportPeriodInput,
  ReportTemplateDefinition,
} from "../../src/modules/report/report.types.js";

export class FakeReportRepository implements ReportRepository {
  template: ReportTemplateDefinition | null = {
    id: 1, code: "INCOME_STATEMENT_CN_ASBE_V1", name: "测试利润表", type: "INCOME_STATEMENT", version: 1,
    items: [
      { id: 11, itemCode: "REVENUE", name: "收入", lineNumber: 1, sortOrder: 1, mappings: [{ accountId: 101, operator: "ADD", valueType: "PERIOD_CREDIT", direction: null, includeChildren: true }], dependencies: [] },
      { id: 12, itemCode: "COST", name: "成本", lineNumber: 2, sortOrder: 2, mappings: [{ accountId: 102, operator: "ADD", valueType: "PERIOD_DEBIT", direction: null, includeChildren: true }], dependencies: [] },
      { id: 13, itemCode: "PROFIT", name: "利润", lineNumber: 3, sortOrder: 3, mappings: [], dependencies: [{ sourceItemId: 11, operator: "ADD", coefficient: "1" }, { sourceItemId: 12, operator: "SUBTRACT", coefficient: "1" }] },
    ],
  };
  accounts: ReportAccount[] = [
    { id: 101, parentId: null, normalDirection: "CREDIT" },
    { id: 102, parentId: null, normalDirection: "DEBIT" },
  ];
  saved: { lines: PersistReportLine[]; period: ReportPeriodInput; periodStart: Date; periodEnd: Date } | null = null;

  async findActiveTemplate(_code: string) { return this.template; }
  async listAccountingPeriods(fiscalYear: number) {
    return Array.from({ length: 12 }, (_, index) => ({
      year: fiscalYear,
      month: index + 1,
      startDate: new Date(fiscalYear, index, 1),
      endDate: new Date(fiscalYear, index + 1, 0, 23, 59, 59, 999),
    }));
  }
  async listAccounts() { return this.accounts; }
  async aggregateEntries(startDate: Date, _endDate: Date): Promise<ReportAccountTotal[]> {
    return startDate.getMonth() === 0
      ? [{ accountId: 101, debit: "0", credit: "300" }, { accountId: 102, debit: "120", credit: "0" }]
      : [{ accountId: 101, debit: "0", credit: "100" }, { accountId: 102, debit: "40", credit: "0" }];
  }
  async aggregateCashCounterparties(_startDate: Date, _endDate: Date, _cashAccountIds: number[]): Promise<ReportCashCounterpartyTotal[]> { return []; }
  async saveReport(input: { templateId: number; period: ReportPeriodInput; periodStart: Date; periodEnd: Date; generatedById: number; lines: PersistReportLine[] }) {
    this.saved = { lines: input.lines, period: input.period, periodStart: input.periodStart, periodEnd: input.periodEnd };
    return {
      id: 201, templateId: input.templateId, periodType: input.period.periodType, fiscalYear: input.period.fiscalYear,
      periodStart: input.periodStart, periodEnd: input.periodEnd, status: 1, generatedById: input.generatedById, generatedAt: new Date(),
      template: { code: "INCOME_STATEMENT_CN_ASBE_V1", name: "测试利润表", type: "INCOME_STATEMENT", version: 1 },
      lines: input.lines.map((line, index) => ({
        id: 300 + index, reportId: 201, ...line,
        reportItem: {
          id: this.template!.items[index]!.id,
          itemCode: this.template!.items[index]!.itemCode,
          name: this.template!.items[index]!.name,
          lineNumber: index + 1,
          sortOrder: index + 1,
          accountMappings: this.template!.items[index]!.mappings.map((m) => ({
            ...m,
            account: { id: m.accountId, code: String(m.accountId), name: `科目${m.accountId}` },
          })),
        },
      })),
    };
  }
  async findReportById(id: number) {
    if (id !== 201) return null;
    return this.saveReport({
      templateId: 1, period: { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      periodStart: new Date(2026, 6, 1), periodEnd: new Date(2026, 6, 31), generatedById: 1, lines: this.saved?.lines ?? [],
    });
  }
}
