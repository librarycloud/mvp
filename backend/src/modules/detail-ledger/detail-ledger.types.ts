export interface DetailLedgerAccount {
  id: number;
  code: string;
  name: string;
  normalDirection: "DEBIT" | "CREDIT";
}

export interface DetailLedgerEntry {
  voucherId: number;
  voucherNo: string;
  voucherDate: Date;
  sequenceNo: number;
  voucherSummary: string;
  lineNo: number;
  entrySummary: string;
  debitAmount: string;
  creditAmount: string;
  dimensions: Array<{ dimensionId: number; dimensionCode: string; dimensionName: string; memberId: number; memberCode: string; memberName: string }>;
}

export interface DetailLedgerQuery {
  accountId: number;
  startDate: Date;
  endDate: Date;
  auxiliaryKey?: string;
  auxiliaryValue?: string;
}
