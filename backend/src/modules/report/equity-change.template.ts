export interface EquityChangeTemplateItem {
  code: string;
  name: string;
  lineNumber: number;
  mappings: Array<{
    accountCode: string;
    valueType: "PERIOD_NET" | "CLOSING_BALANCE";
    direction: "DEBIT" | "CREDIT";
  }>;
}

const components = [
  { code: "PAID_CAPITAL", name: "实收资本（或股本）", accounts: ["4001"], direction: "CREDIT" as const },
  { code: "CAPITAL_RESERVE", name: "资本公积", accounts: ["4002"], direction: "CREDIT" as const },
  { code: "TREASURY_STOCK", name: "减：库存股", accounts: ["4101"], direction: "DEBIT" as const },
  { code: "SURPLUS_RESERVE", name: "盈余公积", accounts: ["4102"], direction: "CREDIT" as const },
  { code: "CURRENT_PROFIT", name: "本年利润", accounts: ["4103"], direction: "CREDIT" as const },
  { code: "PROFIT_DISTRIBUTION", name: "利润分配", accounts: ["4104"], direction: "CREDIT" as const },
] as const;

export const EQUITY_CHANGE_TEMPLATE: EquityChangeTemplateItem[] = ["CY", "PY"].flatMap((year) =>
  components.flatMap((component) => [
    {
      code: `${year}_OPEN_${component.code}`,
      name: `${year === "CY" ? "本年" : "上年"}年初-${component.name}`,
      lineNumber: 7,
      mappings: component.accounts.map((accountCode) => ({ accountCode, valueType: "CLOSING_BALANCE" as const, direction: component.direction })),
    },
    {
      code: `${year}_CHANGE_${component.code}`,
      name: `${year === "CY" ? "本年" : "上年"}变动-${component.name}`,
      lineNumber: component.code === "CURRENT_PROFIT" ? 13 : component.code === "PROFIT_DISTRIBUTION" ? 22 : 18,
      mappings: component.accounts.map((accountCode) => ({ accountCode, valueType: "PERIOD_NET" as const, direction: component.direction })),
    },
  ]),
);
