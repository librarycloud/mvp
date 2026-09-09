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

export interface AuxiliaryBalanceQuery {
  startDate: Date;
  endDate: Date;
  accountId?: number | undefined;
  dimensionId?: number | undefined;
  includeZero?: boolean | undefined;
}

export interface AuxiliaryBalanceRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  dimensionId: number;
  dimensionCode: string;
  dimensionName: string;
  memberId: number;
  memberCode: string;
  memberName: string;
  openingDebit: string;
  openingCredit: string;
  openingDirection: "DEBIT" | "CREDIT" | "FLAT";
  openingBalance: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  closingDirection: "DEBIT" | "CREDIT" | "FLAT";
  closingBalance: string;
}
