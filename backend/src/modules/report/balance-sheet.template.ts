export interface BalanceSheetTemplateItem {
  code: string;
  name: string;
  lineNumber: number;
  mappings?: Array<{ accountCode: string; operator?: "ADD" | "SUBTRACT"; direction: "DEBIT" | "CREDIT" }>;
  dependencies?: Array<{ sourceCode: string; operator: "ADD" | "SUBTRACT" }>;
}

const debit = (accountCode: string, operator: "ADD" | "SUBTRACT" = "ADD") => ({ accountCode, operator, direction: "DEBIT" as const });
const credit = (accountCode: string, operator: "ADD" | "SUBTRACT" = "ADD") => ({ accountCode, operator, direction: "CREDIT" as const });

export const BALANCE_SHEET_TEMPLATE: BalanceSheetTemplateItem[] = [
  { code: "CASH", name: "货币资金", lineNumber: 1, mappings: [debit("1001"), debit("1002"), debit("1012")] },
  { code: "RECEIVABLES", name: "应收票据及应收账款", lineNumber: 2, mappings: [debit("1121"), debit("1122")] },
  { code: "PREPAYMENTS", name: "预付款项", lineNumber: 3, mappings: [debit("1123")] },
  { code: "OTHER_RECEIVABLES", name: "其他应收款", lineNumber: 4, mappings: [debit("1221")] },
  { code: "INVENTORIES", name: "存货", lineNumber: 5, mappings: [debit("1401"), debit("1402"), debit("1403"), debit("1405"), debit("1406"), debit("1408"), debit("1411"), credit("1471", "SUBTRACT")] },
  { code: "TOTAL_CURRENT_ASSETS", name: "流动资产合计", lineNumber: 6, dependencies: [{ sourceCode: "CASH", operator: "ADD" }, { sourceCode: "RECEIVABLES", operator: "ADD" }, { sourceCode: "PREPAYMENTS", operator: "ADD" }, { sourceCode: "OTHER_RECEIVABLES", operator: "ADD" }, { sourceCode: "INVENTORIES", operator: "ADD" }] },
  { code: "LONG_TERM_INVESTMENTS", name: "长期投资", lineNumber: 7, mappings: [debit("1501"), debit("1503"), debit("1511"), credit("1502", "SUBTRACT"), credit("1512", "SUBTRACT")] },
  { code: "FIXED_ASSETS", name: "固定资产", lineNumber: 8, mappings: [debit("1601"), credit("1602", "SUBTRACT"), credit("1603", "SUBTRACT")] },
  { code: "INTANGIBLE_ASSETS", name: "无形资产", lineNumber: 9, mappings: [debit("1701"), credit("1702", "SUBTRACT"), credit("1703", "SUBTRACT")] },
  { code: "LONG_TERM_PREPAID", name: "长期待摊费用", lineNumber: 10, mappings: [debit("1801")] },
  { code: "DEFERRED_TAX_ASSETS", name: "递延所得税资产", lineNumber: 11, mappings: [debit("1811")] },
  { code: "TOTAL_NONCURRENT_ASSETS", name: "非流动资产合计", lineNumber: 12, dependencies: [{ sourceCode: "LONG_TERM_INVESTMENTS", operator: "ADD" }, { sourceCode: "FIXED_ASSETS", operator: "ADD" }, { sourceCode: "INTANGIBLE_ASSETS", operator: "ADD" }, { sourceCode: "LONG_TERM_PREPAID", operator: "ADD" }, { sourceCode: "DEFERRED_TAX_ASSETS", operator: "ADD" }] },
  { code: "TOTAL_ASSETS", name: "资产总计", lineNumber: 13, dependencies: [{ sourceCode: "TOTAL_CURRENT_ASSETS", operator: "ADD" }, { sourceCode: "TOTAL_NONCURRENT_ASSETS", operator: "ADD" }] },
  { code: "SHORT_TERM_BORROWINGS", name: "短期借款", lineNumber: 20, mappings: [credit("2001")] },
  { code: "PAYABLES", name: "应付票据及应付账款", lineNumber: 21, mappings: [credit("2201"), credit("2202")] },
  { code: "ADVANCES", name: "预收款项", lineNumber: 22, mappings: [credit("2203")] },
  { code: "PAYROLL_PAYABLE", name: "应付职工薪酬", lineNumber: 23, mappings: [credit("2211")] },
  { code: "TAX_PAYABLE", name: "应交税费", lineNumber: 24, mappings: [credit("2221")] },
  { code: "OTHER_PAYABLES", name: "其他应付款", lineNumber: 25, mappings: [credit("2241")] },
  { code: "TOTAL_CURRENT_LIABILITIES", name: "流动负债合计", lineNumber: 26, dependencies: [{ sourceCode: "SHORT_TERM_BORROWINGS", operator: "ADD" }, { sourceCode: "PAYABLES", operator: "ADD" }, { sourceCode: "ADVANCES", operator: "ADD" }, { sourceCode: "PAYROLL_PAYABLE", operator: "ADD" }, { sourceCode: "TAX_PAYABLE", operator: "ADD" }, { sourceCode: "OTHER_PAYABLES", operator: "ADD" }] },
  { code: "LONG_TERM_BORROWINGS", name: "长期借款", lineNumber: 27, mappings: [credit("2501")] },
  { code: "BONDS_PAYABLE", name: "应付债券", lineNumber: 28, mappings: [credit("2502")] },
  { code: "LONG_TERM_PAYABLES", name: "长期应付款", lineNumber: 29, mappings: [credit("2701")] },
  { code: "DEFERRED_TAX_LIABILITIES", name: "递延所得税负债", lineNumber: 30, mappings: [credit("2901")] },
  { code: "TOTAL_NONCURRENT_LIABILITIES", name: "非流动负债合计", lineNumber: 31, dependencies: [{ sourceCode: "LONG_TERM_BORROWINGS", operator: "ADD" }, { sourceCode: "BONDS_PAYABLE", operator: "ADD" }, { sourceCode: "LONG_TERM_PAYABLES", operator: "ADD" }, { sourceCode: "DEFERRED_TAX_LIABILITIES", operator: "ADD" }] },
  { code: "TOTAL_LIABILITIES", name: "负债合计", lineNumber: 32, dependencies: [{ sourceCode: "TOTAL_CURRENT_LIABILITIES", operator: "ADD" }, { sourceCode: "TOTAL_NONCURRENT_LIABILITIES", operator: "ADD" }] },
  { code: "PAID_IN_CAPITAL", name: "实收资本", lineNumber: 40, mappings: [credit("4001")] },
  { code: "CAPITAL_RESERVE", name: "资本公积", lineNumber: 41, mappings: [credit("4002")] },
  { code: "TREASURY_STOCK", name: "减：库存股", lineNumber: 42, mappings: [debit("4101")] },
  { code: "SURPLUS_RESERVE", name: "盈余公积", lineNumber: 43, mappings: [credit("4102")] },
  { code: "CURRENT_PROFIT", name: "未分配利润", lineNumber: 44, mappings: [credit("4103"), credit("4104")] },
  { code: "TOTAL_EQUITY", name: "所有者权益合计", lineNumber: 45, dependencies: [{ sourceCode: "PAID_IN_CAPITAL", operator: "ADD" }, { sourceCode: "CAPITAL_RESERVE", operator: "ADD" }, { sourceCode: "TREASURY_STOCK", operator: "SUBTRACT" }, { sourceCode: "SURPLUS_RESERVE", operator: "ADD" }, { sourceCode: "CURRENT_PROFIT", operator: "ADD" }] },
  { code: "TOTAL_LIABILITIES_AND_EQUITY", name: "负债和所有者权益总计", lineNumber: 46, dependencies: [{ sourceCode: "TOTAL_LIABILITIES", operator: "ADD" }, { sourceCode: "TOTAL_EQUITY", operator: "ADD" }] },
];
