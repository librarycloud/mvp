import type { AuthRole } from "../auth/auth.types.js";

export interface ArApActor { actorId: number; role: AuthRole; }
export type ArApPartyKind = "customer" | "supplier";
export type ArApDocumentKind = "receivable" | "payable";

export interface PartyInput {
  code: string; name: string; taxId?: string; contact?: string; phone?: string;
  address?: string; remark?: string; creditLimit?: string; enabled?: boolean;
}

export interface DocumentInput {
  partyId: number; documentNo: string; occurrenceDate: string; dueDate?: string;
  amount: string; currency?: string; description?: string;
}

export interface SettlementInput {
  amount: string; paymentDate: string; bankAccountId: number; settlementAccountId: number;
  bankTransactionId?: number; remark?: string;
}

export interface FollowUpInput {
  customerId?: number;
  supplierId?: number;
  sourceType?: string;
  sourceId?: number;
  scheduledDate: string;
  content: string;
  result?: string;
}
