import { describe, expect, it } from "vitest";
import { ReportService } from "../src/modules/report/report.service.js";
import { FakeReportRepository } from "./helpers/fake-report-repository.js";

describe("ReportService", () => {
  it("calculates profit from mappings and configured formula dependencies", async () => {
    const repository = new FakeReportRepository();
    const result = await new ReportService(repository).generateIncomeStatement(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );
    expect(result).toMatchObject({ id: 201, periodType: "MONTH" });
    const profit = repository.saved!.lines.find((line) => line.reportItemId === 13);
    expect(profit).toMatchObject({ currentAmount: "60", closingAmount: "180" });
  });

  it("stores generated report amounts rounded to two decimal places", async () => {
    const repository = new FakeReportRepository();
    repository.aggregateEntries = async () => [
      { accountId: 101, debit: "0", credit: "123.4567" },
      { accountId: 102, debit: "0", credit: "0" },
    ];

    await new ReportService(repository).generateIncomeStatement(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );

    expect(repository.saved!.lines.find((line) => line.reportItemId === 11)).toMatchObject({
      currentAmount: "123.46",
      closingAmount: "123.46",
    });
  });

  it("rejects formula cycles in template configuration", async () => {
    const repository = new FakeReportRepository();
    repository.template!.items = [
      { id: 1001, itemCode: "A", name: "A", lineNumber: 1, sortOrder: 1, mappings: [], dependencies: [{ sourceItemId: 1002, operator: "ADD", coefficient: "1" }] },
      { id: 1002, itemCode: "B", name: "B", lineNumber: 2, sortOrder: 2, mappings: [], dependencies: [{ sourceItemId: 1001, operator: "ADD", coefficient: "1" }] },
    ];
    await expect(
      new ReportService(repository).generateIncomeStatement({ periodType: "YEAR", fiscalYear: 2026 }, 1),
    ).rejects.toMatchObject({ code: "REPORT_TEMPLATE_CYCLE" });
  });

  it("validates period bounds", async () => {
    await expect(
      new ReportService(new FakeReportRepository()).generateIncomeStatement({ periodType: "QUARTER", fiscalYear: 2026, period: 5 }, 1),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_PERIOD" });
  });

  it("uses the configured accounting-period dates and fiscal-year start", async () => {
    const repository = new FakeReportRepository();
    const yearStart = new Date(2025, 11, 29);
    const monthStart = new Date(2026, 5, 26);
    const monthEnd = new Date(2026, 6, 25, 23, 59, 59, 999);
    repository.listAccountingPeriods = async () => [
      { year: 2026, month: 1, startDate: yearStart, endDate: new Date(2026, 0, 25, 23, 59, 59, 999) },
      { year: 2026, month: 7, startDate: monthStart, endDate: monthEnd },
    ];
    const ranges: Array<[Date, Date]> = [];
    repository.aggregateEntries = async (start, end) => {
      ranges.push([start, end]);
      return [];
    };

    await new ReportService(repository).generateIncomeStatement(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );

    expect(repository.saved?.periodStart).toEqual(monthStart);
    expect(repository.saved?.periodEnd).toEqual(monthEnd);
    expect(ranges).toEqual([[monthStart, monthEnd], [yearStart, monthEnd]]);
  });

  it("allows a year report to start at the first configured month", async () => {
    const repository = new FakeReportRepository();
    repository.listAccountingPeriods = async () => Array.from({ length: 5 }, (_, index) => ({
      year: 2025,
      month: index + 8,
      startDate: new Date(2025, index + 7, 1),
      endDate: new Date(2025, index + 8, 0, 23, 59, 59, 999),
    }));

    await new ReportService(repository).generateIncomeStatement(
      { periodType: "YEAR", fiscalYear: 2025 },
      1,
    );

    expect(repository.saved?.periodStart).toEqual(new Date(2025, 7, 1));
    expect(repository.saved?.periodEnd).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
  });

  it("allows the first quarter to start at the first configured month", async () => {
    const repository = new FakeReportRepository();
    repository.listAccountingPeriods = async () => [
      { year: 2025, month: 8, startDate: new Date(2025, 7, 1), endDate: new Date(2025, 7, 31, 23, 59, 59, 999) },
      { year: 2025, month: 9, startDate: new Date(2025, 8, 1), endDate: new Date(2025, 8, 30, 23, 59, 59, 999) },
    ];

    await new ReportService(repository).generateIncomeStatement(
      { periodType: "QUARTER", fiscalYear: 2025, period: 3 },
      1,
    );

    expect(repository.saved?.periodStart).toEqual(new Date(2025, 7, 1));
    expect(repository.saved?.periodEnd).toEqual(new Date(2025, 8, 30, 23, 59, 59, 999));
  });

  it("uses the earliest and latest configured dates for a quarter", async () => {
    const repository = new FakeReportRepository();
    const quarterStart = new Date(2026, 3, 3);
    const quarterEnd = new Date(2026, 6, 2, 23, 59, 59, 999);
    repository.listAccountingPeriods = async () => [
      { year: 2026, month: 4, startDate: quarterStart, endDate: new Date(2026, 4, 2, 23, 59, 59, 999) },
      { year: 2026, month: 5, startDate: new Date(2026, 4, 3), endDate: new Date(2026, 5, 2, 23, 59, 59, 999) },
      { year: 2026, month: 6, startDate: new Date(2026, 5, 3), endDate: quarterEnd },
    ];

    await new ReportService(repository).generateIncomeStatement(
      { periodType: "QUARTER", fiscalYear: 2026, period: 2 },
      1,
    );

    expect(repository.saved?.periodStart).toEqual(quarterStart);
    expect(repository.saved?.periodEnd).toEqual(quarterEnd);
  });

  it("rejects report generation when no matching accounting period exists", async () => {
    const repository = new FakeReportRepository();
    repository.listAccountingPeriods = async () => [];
    await expect(
      new ReportService(repository).generateIncomeStatement({ periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1),
    ).rejects.toMatchObject({ code: "REPORT_ACCOUNTING_PERIOD_NOT_FOUND" });
  });

  it("uses configured balance mappings for opening and closing balance-sheet amounts", async () => {
    const repository = new FakeReportRepository();
    repository.template = {
      id: 3, code: "BALANCE_SHEET_CN_ASBE_V1", name: "测试资产负债表", type: "BALANCE_SHEET", version: 1,
      items: [
        { id: 31, itemCode: "ASSET", name: "资产", lineNumber: 1, sortOrder: 1, mappings: [{ accountId: 104, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
        { id: 32, itemCode: "LIABILITY", name: "负债", lineNumber: 2, sortOrder: 2, mappings: [{ accountId: 105, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "CREDIT", includeChildren: true }], dependencies: [] },
      ],
    };
    repository.accounts = [
      { id: 104, parentId: null, normalDirection: "DEBIT" },
      { id: 105, parentId: null, normalDirection: "CREDIT" },
    ];
    repository.aggregateEntries = async (_start, end) =>
      end.getDate() === 30
        ? [{ accountId: 104, debit: "100", credit: "0" }, { accountId: 105, debit: "0", credit: "100" }]
        : [{ accountId: 104, debit: "150", credit: "0" }, { accountId: 105, debit: "0", credit: "150" }];

    await new ReportService(repository).generateBalanceSheet(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );
    const asset = repository.saved!.lines.find((line) => line.reportItemId === 31);
    const liability = repository.saved!.lines.find((line) => line.reportItemId === 32);
    expect(asset).toMatchObject({ openingAmount: "100", currentAmount: null, closingAmount: "150" });
    expect(liability).toMatchObject({ openingAmount: "100", closingAmount: "150" });
  });

  it("uses configured balance and movement mappings for indirect cash-flow columns", async () => {
    const repository = new FakeReportRepository();
    repository.template = {
      id: 2, code: "CASH_FLOW_STATEMENT_CN_ASBE_V1", name: "测试现金流", type: "CASH_FLOW_STATEMENT", version: 1,
      items: [
        { id: 21, itemCode: "CASH", name: "现金余额", lineNumber: 1, sortOrder: 1, mappings: [{ accountId: 103, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
        { id: 22, itemCode: "INCREASE", name: "现金净增加", lineNumber: 2, sortOrder: 2, mappings: [{ accountId: 103, operator: "ADD", valueType: "PERIOD_NET", direction: "DEBIT", includeChildren: true }], dependencies: [] },
      ],
    };
    repository.accounts = [{ id: 103, parentId: null, normalDirection: "DEBIT" }];
    repository.aggregateEntries = async (start, end) => {
      if (start.getFullYear() === 2026) return [{ accountId: 103, debit: "10", credit: "0" }];
      return [{ accountId: 103, debit: end.getDate() === 30 ? "100" : "110", credit: "0" }];
    };

    await new ReportService(repository).generateCashFlowStatement(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );
    const cash = repository.saved!.lines.find((line) => line.reportItemId === 21);
    const increase = repository.saved!.lines.find((line) => line.reportItemId === 22);
    expect(cash).toMatchObject({ openingAmount: "100", currentAmount: "0", closingAmount: "110" });
    expect(increase).toMatchObject({ openingAmount: "0", currentAmount: "10", closingAmount: "0" });
  });

  it("reconciles unclassified cash movements into operating cash flow", async () => {
    const repository = new FakeReportRepository();
    repository.template = {
      id: 2, code: "CASH_FLOW_STATEMENT_CN_ASBE_V1", name: "现金流", type: "CASH_FLOW_STATEMENT", version: 1,
      items: [
        { id: 20, itemCode: "NET_CASH_OPERATING", name: "经营现金净额", lineNumber: 1, sortOrder: 1, mappings: [{ accountId: 103, operator: "ADD", valueType: "PERIOD_NET", direction: "DEBIT", includeChildren: true }], dependencies: [] },
        { id: 21, itemCode: "NET_INCREASE_CASH", name: "净增加", lineNumber: 2, sortOrder: 2, mappings: [], dependencies: [{ sourceItemId: 20, operator: "ADD", coefficient: "1" }] },
        { id: 22, itemCode: "CASH_BEGINNING", name: "期初现金", lineNumber: 3, sortOrder: 3, mappings: [{ accountId: 103, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
        { id: 23, itemCode: "CASH_ENDING", name: "期末现金", lineNumber: 4, sortOrder: 4, mappings: [{ accountId: 103, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
      ],
    };
    repository.accounts = [{ id: 103, parentId: null, normalDirection: "DEBIT" }];
    repository.aggregateEntries = async (start, end) => {
      if (start.getFullYear() === 2026) return [{ accountId: 103, debit: "30", credit: "0" }];
      return [{ accountId: 103, debit: end.getDate() > 30 ? "120" : "100", credit: "0" }];
    };
    await new ReportService(repository).generateCashFlowStatement({ periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1);
    const operating = repository.saved!.lines.find((line) => line.reportItemId === 20);
    const netIncrease = repository.saved!.lines.find((line) => line.reportItemId === 21);
    expect(operating).toMatchObject({ currentAmount: "20", calculationTrace: { current: { cashReconciliationAdjustment: { adjustment: "-10" } } } });
    expect(netIncrease).toMatchObject({ currentAmount: "20", calculationTrace: { current: { cashReconciliation: { cashBalanceDifference: "20" } } } });
  });

  it("calculates current-year and prior-year equity movements independently", async () => {
    const repository = new FakeReportRepository();
    repository.template = {
      id: 4, code: "EQUITY_CHANGE_STATEMENT_CN_ASBE_V1", name: "所有者权益变动表", type: "EQUITY_CHANGE_STATEMENT", version: 1,
      items: [
        { id: 41, itemCode: "CY_OPEN_PAID_CAPITAL", name: "本年年初实收资本", lineNumber: 7, sortOrder: 1, mappings: [{ accountId: 106, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "CREDIT", includeChildren: true }], dependencies: [] },
        { id: 42, itemCode: "CY_CHANGE_PAID_CAPITAL", name: "本年实收资本变动", lineNumber: 18, sortOrder: 2, mappings: [{ accountId: 106, operator: "ADD", valueType: "PERIOD_NET", direction: "CREDIT", includeChildren: true }], dependencies: [] },
        { id: 43, itemCode: "PY_OPEN_PAID_CAPITAL", name: "上年年初实收资本", lineNumber: 7, sortOrder: 3, mappings: [{ accountId: 106, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "CREDIT", includeChildren: true }], dependencies: [] },
        { id: 44, itemCode: "PY_CHANGE_PAID_CAPITAL", name: "上年实收资本变动", lineNumber: 18, sortOrder: 4, mappings: [{ accountId: 106, operator: "ADD", valueType: "PERIOD_NET", direction: "CREDIT", includeChildren: true }], dependencies: [] },
      ],
    };
    repository.accounts = [{ id: 106, parentId: null, normalDirection: "CREDIT" }];
    repository.aggregateEntries = async (start, end) => {
      if (start.getFullYear() === 1900) {
        return [{ accountId: 106, debit: "0", credit: end.getFullYear() === 2026 ? "100" : "80" }];
      }
      return [{ accountId: 106, debit: "0", credit: start.getFullYear() === 2026 ? "15" : "10" }];
    };

    await new ReportService(repository).generateEquityChangeStatement(
      { periodType: "MONTH", fiscalYear: 2026, period: 7 },
      1,
    );

    expect(repository.saved!.lines.map((line) => line.currentAmount)).toEqual(["100", "15", "80", "10"]);
  });

  it("classifies direct-method cash flows from voucher counterparties", async () => {
    const repository = new FakeReportRepository();
    repository.template = {
      id: 9, code: "CASH_FLOW_STATEMENT_CN_ASBE_V1", name: "direct", type: "CASH_FLOW_STATEMENT", version: 2,
      items: [
        { id: 91, itemCode: "OPERATING_CASH_SALES", name: "sales", lineNumber: 7, sortOrder: 1, mappings: [{ accountId: 101, operator: "ADD", valueType: "CASH_INFLOW", direction: null, includeChildren: true }], dependencies: [] },
        { id: 92, itemCode: "OPERATING_PURCHASES", name: "purchases", lineNumber: 11, sortOrder: 2, mappings: [{ accountId: 102, operator: "ADD", valueType: "CASH_OUTFLOW", direction: null, includeChildren: true }], dependencies: [] },
        { id: 93, itemCode: "OPERATING_OTHER_INFLOW", name: "other inflow", lineNumber: 9, sortOrder: 3, mappings: [], dependencies: [] },
        { id: 94, itemCode: "OPERATING_OTHER_OUTFLOW", name: "other outflow", lineNumber: 14, sortOrder: 4, mappings: [], dependencies: [] },
        { id: 95, itemCode: "NET_CASH_OPERATING", name: "operating net", lineNumber: 16, sortOrder: 5, mappings: [], dependencies: [{ sourceItemId: 91, operator: "ADD", coefficient: "1" }, { sourceItemId: 92, operator: "SUBTRACT", coefficient: "1" }, { sourceItemId: 93, operator: "ADD", coefficient: "1" }, { sourceItemId: 94, operator: "SUBTRACT", coefficient: "1" }] },
        { id: 96, itemCode: "NET_INCREASE_CASH", name: "cash increase", lineNumber: 41, sortOrder: 6, mappings: [], dependencies: [{ sourceItemId: 95, operator: "ADD", coefficient: "1" }] },
        { id: 97, itemCode: "CASH_BEGINNING", name: "cash beginning", lineNumber: 42, sortOrder: 7, mappings: [{ accountId: 103, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
        { id: 98, itemCode: "CASH_ENDING", name: "cash ending", lineNumber: 43, sortOrder: 8, mappings: [{ accountId: 103, operator: "ADD", valueType: "CLOSING_BALANCE", direction: "DEBIT", includeChildren: true }], dependencies: [] },
      ],
    };
    repository.accounts = [{ id: 101, parentId: null, normalDirection: "CREDIT" }, { id: 102, parentId: null, normalDirection: "CREDIT" }, { id: 103, parentId: null, normalDirection: "DEBIT" }];
    repository.aggregateEntries = async (start, end) => [{ accountId: 103, debit: start.getFullYear() === 1900 ? (end.getDate() > 30 ? "130" : "100") : "130", credit: "0" }];
    repository.aggregateCashCounterparties = async () => [{ accountId: 101, inflow: "100", outflow: "0" }, { accountId: 102, inflow: "0", outflow: "70" }];

    await new ReportService(repository).generateCashFlowStatement({ periodType: "MONTH", fiscalYear: 2026, period: 7 }, 1);

    expect(repository.saved!.lines.find((line) => line.reportItemId === 91)).toMatchObject({ currentAmount: "100" });
    expect(repository.saved!.lines.find((line) => line.reportItemId === 92)).toMatchObject({ currentAmount: "70" });
    expect(repository.saved!.lines.find((line) => line.reportItemId === 96)).toMatchObject({ currentAmount: "30" });
  });
});
