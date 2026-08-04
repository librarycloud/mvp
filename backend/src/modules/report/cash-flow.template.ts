export interface CashFlowTemplateItem {
  code: string;
  name: string;
  lineNumber: number;
  mappings?: Array<{
    accountCode: string;
    valueType: "CASH_INFLOW" | "CASH_OUTFLOW" | "CLOSING_BALANCE";
    direction?: "DEBIT" | "CREDIT";
  }>;
  dependencies?: Array<{ sourceCode: string; operator: "ADD" | "SUBTRACT" }>;
}

const cashInflow = (accountCode: string) => ({ accountCode, valueType: "CASH_INFLOW" as const });
const cashOutflow = (accountCode: string) => ({ accountCode, valueType: "CASH_OUTFLOW" as const });
const cashBalance = (accountCode: string) => ({ accountCode, valueType: "CLOSING_BALANCE" as const, direction: "DEBIT" as const });

export const CASH_FLOW_TEMPLATE: CashFlowTemplateItem[] = [
  { code: "OPERATING_CASH_SALES", name: "销售商品、提供劳务收到的现金", lineNumber: 7, mappings: [cashInflow("6001"), cashInflow("6051"), cashInflow("1121"), cashInflow("1122")] },
  { code: "OPERATING_TAX_REFUND", name: "收到的税费返还", lineNumber: 8 },
  { code: "OPERATING_OTHER_INFLOW", name: "收到其他与经营活动有关的现金", lineNumber: 9 },
  { code: "OPERATING_CASH_INFLOW_TOTAL", name: "经营活动现金流入小计", lineNumber: 10, dependencies: [{ sourceCode: "OPERATING_CASH_SALES", operator: "ADD" }, { sourceCode: "OPERATING_TAX_REFUND", operator: "ADD" }, { sourceCode: "OPERATING_OTHER_INFLOW", operator: "ADD" }] },
  { code: "OPERATING_PURCHASES", name: "购买商品、接受劳务支付的现金", lineNumber: 11, mappings: [cashOutflow("1123"), cashOutflow("1401"), cashOutflow("1402"), cashOutflow("1403"), cashOutflow("1404"), cashOutflow("1405"), cashOutflow("1406"), cashOutflow("1407"), cashOutflow("1408"), cashOutflow("1411"), cashOutflow("2201"), cashOutflow("2202")] },
  { code: "OPERATING_EMPLOYEE_PAYMENTS", name: "支付给职工以及为职工支付的现金", lineNumber: 12, mappings: [cashOutflow("2211")] },
  { code: "OPERATING_TAX_PAYMENTS", name: "支付的各项税费", lineNumber: 13, mappings: [cashOutflow("2221")] },
  { code: "OPERATING_OTHER_OUTFLOW", name: "支付其他与经营活动有关的现金", lineNumber: 14 },
  { code: "OPERATING_CASH_OUTFLOW_TOTAL", name: "经营活动现金流出小计", lineNumber: 15, dependencies: [{ sourceCode: "OPERATING_PURCHASES", operator: "ADD" }, { sourceCode: "OPERATING_EMPLOYEE_PAYMENTS", operator: "ADD" }, { sourceCode: "OPERATING_TAX_PAYMENTS", operator: "ADD" }, { sourceCode: "OPERATING_OTHER_OUTFLOW", operator: "ADD" }] },
  { code: "NET_CASH_OPERATING", name: "经营活动产生的现金流量净额", lineNumber: 16, dependencies: [{ sourceCode: "OPERATING_CASH_INFLOW_TOTAL", operator: "ADD" }, { sourceCode: "OPERATING_CASH_OUTFLOW_TOTAL", operator: "SUBTRACT" }] },

  { code: "INVESTING_RECOVERY", name: "收回投资收到的现金", lineNumber: 18, mappings: [cashInflow("1501"), cashInflow("1503"), cashInflow("1511")] },
  { code: "INVESTING_INCOME", name: "取得投资收益收到的现金", lineNumber: 19, mappings: [cashInflow("6111"), cashInflow("1131"), cashInflow("1132")] },
  { code: "INVESTING_DISPOSAL_ASSETS", name: "处置固定资产、无形资产和其他长期资产收回的现金净额", lineNumber: 20, mappings: [cashInflow("1601"), cashInflow("1606"), cashInflow("1701"), cashInflow("1801")] },
  { code: "INVESTING_DISPOSAL_SUBSIDIARY", name: "处置子公司及其他营业单位收到的现金净额", lineNumber: 21 },
  { code: "INVESTING_OTHER_INFLOW", name: "收到其他与投资活动有关的现金", lineNumber: 22 },
  { code: "INVESTING_CASH_INFLOW_TOTAL", name: "投资活动现金流入小计", lineNumber: 23, dependencies: [{ sourceCode: "INVESTING_RECOVERY", operator: "ADD" }, { sourceCode: "INVESTING_INCOME", operator: "ADD" }, { sourceCode: "INVESTING_DISPOSAL_ASSETS", operator: "ADD" }, { sourceCode: "INVESTING_DISPOSAL_SUBSIDIARY", operator: "ADD" }, { sourceCode: "INVESTING_OTHER_INFLOW", operator: "ADD" }] },
  { code: "INVESTING_PURCHASE_ASSETS", name: "购建固定资产、无形资产和其他长期资产支付的现金", lineNumber: 24, mappings: [cashOutflow("1601"), cashOutflow("1604"), cashOutflow("1605"), cashOutflow("1701"), cashOutflow("1801")] },
  { code: "INVESTING_PURCHASE_INVESTMENTS", name: "投资支付的现金", lineNumber: 25, mappings: [cashOutflow("1501"), cashOutflow("1503"), cashOutflow("1511")] },
  { code: "INVESTING_PURCHASE_SUBSIDIARY", name: "取得子公司及其他营业单位支付的现金净额", lineNumber: 26 },
  { code: "INVESTING_OTHER_OUTFLOW", name: "支付其他与投资活动有关的现金", lineNumber: 27 },
  { code: "INVESTING_CASH_OUTFLOW_TOTAL", name: "投资活动现金流出小计", lineNumber: 28, dependencies: [{ sourceCode: "INVESTING_PURCHASE_ASSETS", operator: "ADD" }, { sourceCode: "INVESTING_PURCHASE_INVESTMENTS", operator: "ADD" }, { sourceCode: "INVESTING_PURCHASE_SUBSIDIARY", operator: "ADD" }, { sourceCode: "INVESTING_OTHER_OUTFLOW", operator: "ADD" }] },
  { code: "NET_CASH_INVESTING", name: "投资活动产生的现金流量净额", lineNumber: 29, dependencies: [{ sourceCode: "INVESTING_CASH_INFLOW_TOTAL", operator: "ADD" }, { sourceCode: "INVESTING_CASH_OUTFLOW_TOTAL", operator: "SUBTRACT" }] },

  { code: "FINANCING_CAPITAL_INFLOW", name: "吸收投资收到的现金", lineNumber: 31, mappings: [cashInflow("4001"), cashInflow("4002")] },
  { code: "FINANCING_BORROWING_INFLOW", name: "取得借款收到的现金", lineNumber: 32, mappings: [cashInflow("2001"), cashInflow("2501"), cashInflow("2502")] },
  { code: "FINANCING_OTHER_INFLOW", name: "收到其他与筹资活动有关的现金", lineNumber: 33 },
  { code: "FINANCING_CASH_INFLOW_TOTAL", name: "筹资活动现金流入小计", lineNumber: 34, dependencies: [{ sourceCode: "FINANCING_CAPITAL_INFLOW", operator: "ADD" }, { sourceCode: "FINANCING_BORROWING_INFLOW", operator: "ADD" }, { sourceCode: "FINANCING_OTHER_INFLOW", operator: "ADD" }] },
  { code: "FINANCING_REPAYMENT", name: "偿还债务支付的现金", lineNumber: 35, mappings: [cashOutflow("2001"), cashOutflow("2501"), cashOutflow("2502")] },
  { code: "FINANCING_DIVIDEND_INTEREST", name: "分配股利、利润或偿付利息支付的现金", lineNumber: 36, mappings: [cashOutflow("2231"), cashOutflow("2232"), cashOutflow("4104")] },
  { code: "FINANCING_OTHER_OUTFLOW", name: "支付其他与筹资活动有关的现金", lineNumber: 37 },
  { code: "FINANCING_CASH_OUTFLOW_TOTAL", name: "筹资活动现金流出小计", lineNumber: 38, dependencies: [{ sourceCode: "FINANCING_REPAYMENT", operator: "ADD" }, { sourceCode: "FINANCING_DIVIDEND_INTEREST", operator: "ADD" }, { sourceCode: "FINANCING_OTHER_OUTFLOW", operator: "ADD" }] },
  { code: "NET_CASH_FINANCING", name: "筹资活动产生的现金流量净额", lineNumber: 39, dependencies: [{ sourceCode: "FINANCING_CASH_INFLOW_TOTAL", operator: "ADD" }, { sourceCode: "FINANCING_CASH_OUTFLOW_TOTAL", operator: "SUBTRACT" }] },
  { code: "FX_EFFECT", name: "汇率变动对现金及现金等价物的影响", lineNumber: 40 },
  { code: "NET_INCREASE_CASH", name: "现金及现金等价物净增加额", lineNumber: 41, dependencies: [{ sourceCode: "NET_CASH_OPERATING", operator: "ADD" }, { sourceCode: "NET_CASH_INVESTING", operator: "ADD" }, { sourceCode: "NET_CASH_FINANCING", operator: "ADD" }, { sourceCode: "FX_EFFECT", operator: "ADD" }] },
  { code: "CASH_BEGINNING", name: "期初现金及现金等价物余额", lineNumber: 42, mappings: [cashBalance("1001"), cashBalance("1002"), cashBalance("1012")] },
  { code: "CASH_ENDING", name: "期末现金及现金等价物余额", lineNumber: 43, mappings: [cashBalance("1001"), cashBalance("1002"), cashBalance("1012")] },
];
