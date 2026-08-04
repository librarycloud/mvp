export interface ReportAccount {
  id: number;
  parentId: number | null;
  normalDirection: "DEBIT" | "CREDIT";
}

export interface ReportAccountTotal {
  accountId: number;
  debit: string;
  credit: string;
}

export interface ReportCashCounterpartyTotal {
  accountId: number;
  inflow: string;
  outflow: string;
}

export interface ReportMapping {
  accountId: number;
  operator: "ADD" | "SUBTRACT";
  valueType:
    | "OPENING_BALANCE"
    | "CLOSING_BALANCE"
    | "PERIOD_DEBIT"
    | "PERIOD_CREDIT"
    | "PERIOD_NET"
    | "YEAR_TO_DATE_DEBIT"
    | "YEAR_TO_DATE_CREDIT"
    | "YEAR_TO_DATE_NET"
    | "CASH_INFLOW"
    | "CASH_OUTFLOW";
  direction: "DEBIT" | "CREDIT" | null;
  includeChildren: boolean;
}

export interface ReportDependency {
  sourceItemId: number;
  operator: "ADD" | "SUBTRACT";
  coefficient: string;
}

export interface ReportTemplateItem {
  id: number;
  itemCode: string;
  name: string;
  lineNumber: number | null;
  sortOrder: number;
  mappings: ReportMapping[];
  dependencies: ReportDependency[];
}

export interface ReportTemplateDefinition {
  id: number;
  code: string;
  name: string;
  type: "BALANCE_SHEET" | "INCOME_STATEMENT" | "CASH_FLOW_STATEMENT" | "EQUITY_CHANGE_STATEMENT" | "CUSTOM";
  version: number;
  items: ReportTemplateItem[];
}

export interface ReportPeriodInput {
  periodType: "MONTH" | "QUARTER" | "YEAR";
  fiscalYear: number;
  period?: number;
}

export interface ReportAccountingPeriod {
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
}
