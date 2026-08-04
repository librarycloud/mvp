export interface TrialAccount {
  id: number;
  code: string;
  name: string;
  category: string;
  normalDirection: "DEBIT" | "CREDIT";
  isLeaf: boolean;
  sortOrder: number;
  deletedAt: Date | null;
}

export interface TrialDebitCreditTotal {
  accountId: number;
  debit: string;
  credit: string;
}

export interface TrialBalanceQuery {
  startDate: Date;
  endDate: Date;
  includeZero: boolean;
}
