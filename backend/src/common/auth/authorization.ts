import { AppError } from "../errors/app-error.js";
import type { AuthRole } from "../../modules/auth/auth.types.js";

export const USER_ROLES = ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT", "CASHIER"] as const;

export function hasRole(role: AuthRole, roles: readonly AuthRole[]): boolean {
  return roles.includes(role);
}

export function requireRole(role: AuthRole, roles: readonly AuthRole[], message = "没有执行此操作的权限"): void {
  if (!hasRole(role, roles)) throw new AppError("FORBIDDEN", message, 403);
}

export function canManageUsers(role: AuthRole): boolean {
  return role === "ADMIN";
}

export function canManageSystemSettings(role: AuthRole): boolean {
  return role === "ADMIN";
}

export function canManageAccounting(role: AuthRole): boolean {
  return hasRole(role, ["ADMIN", "FINANCE_MANAGER"]);
}

export function canEditAccounting(role: AuthRole): boolean {
  return hasRole(role, ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"]);
}

export function canOperateCash(role: AuthRole): boolean {
  return hasRole(role, ["ADMIN", "FINANCE_MANAGER", "CASHIER"]);
}
