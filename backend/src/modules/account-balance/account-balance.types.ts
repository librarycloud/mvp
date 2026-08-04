export interface BalanceAccount {
  id: number;
  code: string;
  name: string;
  category: string;
  normalDirection: "DEBIT" | "CREDIT";
  parentId: number | null;
  level: number;
  sortOrder: number;
  isEnabled: boolean;
  deletedAt: Date | null;
}

export interface DebitCreditTotal {
  accountId: number;
  debit: string;
  credit: string;
}

export interface AccountBalanceQuery {
  startDate: Date;
  endDate: Date;
  includeZero: boolean;
}
