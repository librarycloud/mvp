export interface IncomeStatementTemplateItem {
  code: string;
  name: string;
  lineNumber: number;
  mappings?: Array<{ accountCode: string; valueType: "PERIOD_DEBIT" | "PERIOD_CREDIT" }>;
  dependencies?: Array<{ sourceCode: string; operator: "ADD" | "SUBTRACT" }>;
}

export const INCOME_STATEMENT_TEMPLATE: IncomeStatementTemplateItem[] = [
  { code: "OPERATING_REVENUE", name: "营业收入", lineNumber: 1, mappings: [{ accountCode: "6001", valueType: "PERIOD_CREDIT" }, { accountCode: "6051", valueType: "PERIOD_CREDIT" }] },
  { code: "OPERATING_COST", name: "营业成本", lineNumber: 2, mappings: [{ accountCode: "6401", valueType: "PERIOD_DEBIT" }, { accountCode: "6402", valueType: "PERIOD_DEBIT" }] },
  { code: "TAXES_AND_SURCHARGES", name: "税金及附加", lineNumber: 3, mappings: [{ accountCode: "6403", valueType: "PERIOD_DEBIT" }] },
  { code: "SELLING_EXPENSES", name: "销售费用", lineNumber: 4, mappings: [{ accountCode: "6601", valueType: "PERIOD_DEBIT" }] },
  { code: "ADMINISTRATIVE_EXPENSES", name: "管理费用", lineNumber: 5, mappings: [{ accountCode: "6602", valueType: "PERIOD_DEBIT" }] },
  { code: "FINANCE_EXPENSES", name: "财务费用", lineNumber: 6, mappings: [{ accountCode: "6603", valueType: "PERIOD_DEBIT" }] },
  { code: "ASSET_IMPAIRMENT", name: "资产减值损失", lineNumber: 7, mappings: [{ accountCode: "6701", valueType: "PERIOD_DEBIT" }] },
  { code: "FAIR_VALUE_GAIN", name: "公允价值变动收益", lineNumber: 8, mappings: [{ accountCode: "6101", valueType: "PERIOD_CREDIT" }] },
  { code: "INVESTMENT_INCOME", name: "投资收益", lineNumber: 9, mappings: [{ accountCode: "6111", valueType: "PERIOD_CREDIT" }] },
  { code: "OPERATING_PROFIT", name: "营业利润", lineNumber: 10, dependencies: [
    { sourceCode: "OPERATING_REVENUE", operator: "ADD" }, { sourceCode: "OPERATING_COST", operator: "SUBTRACT" },
    { sourceCode: "TAXES_AND_SURCHARGES", operator: "SUBTRACT" }, { sourceCode: "SELLING_EXPENSES", operator: "SUBTRACT" },
    { sourceCode: "ADMINISTRATIVE_EXPENSES", operator: "SUBTRACT" }, { sourceCode: "FINANCE_EXPENSES", operator: "SUBTRACT" },
    { sourceCode: "ASSET_IMPAIRMENT", operator: "SUBTRACT" }, { sourceCode: "FAIR_VALUE_GAIN", operator: "ADD" },
    { sourceCode: "INVESTMENT_INCOME", operator: "ADD" },
  ] },
  { code: "NON_OPERATING_INCOME", name: "营业外收入", lineNumber: 11, mappings: [{ accountCode: "6301", valueType: "PERIOD_CREDIT" }] },
  { code: "NON_OPERATING_EXPENSE", name: "营业外支出", lineNumber: 12, mappings: [{ accountCode: "6711", valueType: "PERIOD_DEBIT" }] },
  { code: "TOTAL_PROFIT", name: "利润总额", lineNumber: 13, dependencies: [{ sourceCode: "OPERATING_PROFIT", operator: "ADD" }, { sourceCode: "NON_OPERATING_INCOME", operator: "ADD" }, { sourceCode: "NON_OPERATING_EXPENSE", operator: "SUBTRACT" }] },
  { code: "INCOME_TAX_EXPENSE", name: "所得税费用", lineNumber: 14, mappings: [{ accountCode: "6801", valueType: "PERIOD_DEBIT" }] },
  { code: "NET_PROFIT", name: "净利润", lineNumber: 15, dependencies: [{ sourceCode: "TOTAL_PROFIT", operator: "ADD" }, { sourceCode: "INCOME_TAX_EXPENSE", operator: "SUBTRACT" }] },
];
