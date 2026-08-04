import type { AuthRole } from "../auth/auth.types.js";

export interface ReimbursementActor {
  actorId: number;
  role: AuthRole;
}

export interface ReimbursementInput {
  applicantName: string;
  department?: string;
  expenseDate: string;
  expenseType: string;
  amount: string;
  currency?: string;
  description?: string;
  evidenceType?: number;
  evidenceDescription?: string;
  invoiceIds?: number[];
  invoiceTaxTreatments?: InvoiceTaxTreatmentInput[];
}

export interface InvoiceTaxTreatmentInput {
  invoiceId: number;
  deductionStatus: number;
  deductibleTaxAmount: string;
}

export interface AvailableInvoiceFilter {
  keyword?: string;
  reimbursementId?: number;
}

export interface ReimbursementListFilter {
  page?: number;
  pageSize?: number;
  status?: string;
  applicantName?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
}

export interface ReimbursementPaymentInput {
  paymentDate: string;
  expenseAccountId: number;
  paymentAccountId: number;
  inputTaxAccountId?: number;
  bankTransactionId?: number;
  remark?: string;
}

export interface ReimbursementRejectInput {
  reason?: string;
}
