export interface LedgerAccount {
  id: number;
  code: string;
  name: string;
  normalDirection: "DEBIT" | "CREDIT";
}

export interface LedgerEntryRecord {
  voucherId: number;
  voucherNo: string;
  voucherDate: Date;
  sequenceNo: number;
  lineNo: number;
  summary: string;
  debitAmount: string;
  creditAmount: string;
}

export interface LedgerQuery {
  accountId: number;
  startDate: Date;
  endDate: Date;
}
