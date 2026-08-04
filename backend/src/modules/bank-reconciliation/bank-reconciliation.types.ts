import type { AuthRole } from "../auth/auth.types.js";

export interface BankReconciliationActor { actorId: number; role: AuthRole; }
export interface BankReconciliationInput {
  periodId: number;
  bankAccountId: number;
  statementOpeningBalance: string;
  statementClosingBalance: string;
  remark?: string;
}
export interface BankReconciliationUpdateInput {
  statementOpeningBalance: string;
  statementClosingBalance: string;
  remark?: string;
}
export interface BankMatchInput {
  bankTransactionId: number;
  voucherEntryId: number;
  matchedAmount: string;
}
export type BankTransactionDirection = "INFLOW" | "OUTFLOW";
