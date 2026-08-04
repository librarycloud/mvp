export interface ParsedBankTransaction {
  payerAccount: string | null;
  payerName: string | null;
  payerBank: string | null;
  payerCurrency: string | null;
  payeeAccount: string | null;
  payeeName: string | null;
  payeeBank: string | null;
  payeeCurrency: string | null;
  amount: string;
  balance: string | null;
  transactionTime: Date;
  transactionNo: string;
  transactionType: string | null;
  summary: string | null;
  rawData: Record<string, string | null>;
}

export interface BankImportError {
  row: number;
  message: string;
  transactionNo?: string;
}

export interface BankParseResult {
  totalCount: number;
  transactions: ParsedBankTransaction[];
  errors: BankImportError[];
}

export interface BankImportContext {
  actorId: number;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface BankTransactionFilter {
  page: number;
  pageSize: number;
  keyword?: string;
  startTime?: Date;
  endTime?: Date;
  voucherStatus?: "UNPOSTED" | "VOUCHERED";
  reconciliationStatus?: "UNMATCHED" | "MATCHED";
}
