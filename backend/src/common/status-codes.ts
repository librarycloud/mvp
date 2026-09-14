export const USER_STATUS = { ACTIVE: 0, DISABLED: 1 } as const;
export const IMPORT_STATUS = { PROCESSING: 0, COMPLETED: 1, PARTIALLY_COMPLETED: 2, FAILED: 3 } as const;
export const INVOICE_STATUS = { IMPORTED: 0, VERIFIED: 1, VOIDED: 2 } as const;
export const VOUCHER_STATUS = { DRAFT: 0, PENDING: 1, POSTED: 2, VOID: 3 } as const;
export const ACCOUNTING_PERIOD_STATUS = { OPEN: 0, CLOSED: 1, LOCKED: 2 } as const;
export const AI_SUGGESTION_STATUS = { PENDING: 0, GENERATED: 1, ACCEPTED: 2, REJECTED: 3, FAILED: 4 } as const;
export const REPORT_STATUS = { GENERATED: 0, EXPORTED: 1 } as const;
export const FIXED_ASSET_STATUS = { ACTIVE: 0, INACTIVE: 1, DISCARDED: 2, SOLD: 3 } as const;
export const POSTING_STATUS = { POSTED: 2, VOID: 3 } as const;
export const AR_AP_STATUS = { OPEN: 0, PARTIAL: 1, SETTLED: 2 } as const;
export const EMPLOYEE_STATUS = { ACTIVE: 0, INACTIVE: 1 } as const;
export const REIMBURSEMENT_STATUS = { DRAFT: 0, PENDING: 1, APPROVED: 2, REJECTED: 3, PAID: 4 } as const;

import { AppError } from "./errors/app-error.js";

export type StatusMap = Record<string, number>;

export function parseStatus(value: string | number | undefined, map: StatusMap, field = "状态") {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return value;
  if (/^\d+$/.test(value)) return Number(value);
  const status = map[value];
  // P1 修复：改用 AppError 返回 400，原来的通用 Error 会导致 500 Internal Server Error
  if (status === undefined) throw new AppError("INVALID_STATUS", `${field}无效：${value}`, 400);
  return status;
}
