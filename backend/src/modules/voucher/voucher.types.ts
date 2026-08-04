import type { AuthRole } from "../auth/auth.types.js";

export interface VoucherEntryInput {
  accountId: number;
  summary: string;
  debitAmount: string;
  creditAmount: string;
  dimensionMemberIds?: number[];
}

export interface NormalizedVoucherEntry extends VoucherEntryInput {
  lineNo: number;
  dimensionMemberIds: number[];
}

export interface VoucherWriteData {
  voucherDate: Date;
  postingDate: Date;
  periodId?: number;
  fiscalYear: number;
  fiscalPeriod: number;
  summary: string;
  category: VoucherCategory;
  totalDebit: string;
  totalCredit: string;
  entries: NormalizedVoucherEntry[];
}

export type VoucherCategory = "RECEIPT" | "PAYMENT" | "TRANSFER" | "ACCRUAL" | "CLOSING" | "OTHER";

export interface VoucherActor {
  actorId: number;
  role: AuthRole;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VoucherMutationRecord {
  id: number;
  voucherNo: string;
  status: number;
  createdById: number;
  summary: string;
  fiscalYear: number;
  fiscalPeriod: number;
  voucherDate: Date;
  postingDate?: Date;
  periodId?: number;
  reviewerId?: number | null;
  reviewedAt?: Date | null;
  totalDebit: string;
  totalCredit: string;
}

export type VoucherStatus = VoucherMutationRecord["status"];

export interface AiSuggestionForVoucher {
  id: number;
  status: number;
  requestedById: number;
  bankTransactionId: number | null;
  invoiceId: number | null;
  suggestion: unknown;
}

export interface VoucherFilter {
  page: number;
  pageSize: number;
  status?: VoucherStatus;
  category?: VoucherCategory;
  keyword?: string;
  fiscalYear?: number;
  fiscalPeriod?: number;
  periodId?: number;
  startDate?: Date;
  endDate?: Date;
}
