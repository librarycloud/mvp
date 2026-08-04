import type { AuthRole } from "../auth/auth.types.js";

export interface AccountCandidate {
  code: string;
  name: string;
  category: string;
  normalDirection: "DEBIT" | "CREDIT";
}

export interface BankSourceSnapshot {
  id: number;
  payerName: string | null;
  payeeName: string | null;
  amount: string;
  transactionTime: string;
  transactionType: string | null;
  summary: string | null;
}

export interface InvoiceItemSnapshot {
  itemName: string;
  amount: string;
  taxRate: string | null;
  taxClassificationCode: string | null;
}

export interface InvoiceSourceSnapshot {
  id: number;
  invoiceNumber: string;
  direction: "PURCHASE" | "SALE" | "UNKNOWN";
  issueTime: string;
  sellerName: string;
  sellerIdNum: string;
  buyerName: string;
  buyerIdNum: string;
  totalAmountWithoutTax: string;
  totalTaxAmount: string;
  totalTaxIncludedAmount: string;
  items: InvoiceItemSnapshot[];
}

export interface VoucherSuggestionInput {
  userSummary: string | null;
  bankTransaction: BankSourceSnapshot | null;
  invoice: InvoiceSourceSnapshot | null;
  candidateAccounts: AccountCandidate[];
}

export interface SuggestedEntry {
  direction: "DEBIT" | "CREDIT";
  accountCode: string;
  rationale: string;
}

export interface VoucherSuggestionOutput {
  summary: string;
  entries: SuggestedEntry[];
}

export interface SuggestionRequester {
  actorId: number;
  role: AuthRole;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}
