import { defineStore } from "pinia";
import { api } from "../utils/api";

export type UserRole = "ADMIN" | "FINANCE_MANAGER" | "ACCOUNTANT" | "CASHIER";
export interface CurrentUser { id: number; username: string; displayName: string; role: UserRole }

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "系统管理员",
  FINANCE_MANAGER: "财务主管",
  ACCOUNTANT: "会计",
  CASHIER: "出纳",
};

function clearStoredSession() {
  localStorage.removeItem("finance_access_token");
  localStorage.removeItem("finance_refresh_token");
  localStorage.removeItem("finance_user");
  localStorage.removeItem("finance_idle_timeout_minutes");
  localStorage.removeItem("finance_last_activity_at");
}

function loadStoredSession() {
  const accessToken = localStorage.getItem("finance_access_token") ?? "";
  const refreshToken = localStorage.getItem("finance_refresh_token") ?? "";
  const storedUser = localStorage.getItem("finance_user");
  const idleTimeoutMinutes = Number(localStorage.getItem("finance_idle_timeout_minutes") ?? 30);
  if (!accessToken) return { accessToken: "", refreshToken: "", user: null as CurrentUser | null, idleTimeoutMinutes: 30 };
  try {
    if (!storedUser) throw new Error("Missing stored user");
    return { accessToken, refreshToken, user: JSON.parse(storedUser) as CurrentUser, idleTimeoutMinutes: Number.isSafeInteger(idleTimeoutMinutes) ? idleTimeoutMinutes : 30 };
  } catch {
    clearStoredSession();
    return { accessToken: "", refreshToken: "", user: null as CurrentUser | null, idleTimeoutMinutes: 30 };
  }
}

export const useAuthStore = defineStore("auth", {
  state: loadStoredSession,
  getters: {
    loggedIn: (state) => Boolean(state.accessToken),
    isSystemAdmin: (state) => state.user?.role === "ADMIN",
    canManageAccounting: (state) => state.user?.role === "ADMIN" || state.user?.role === "FINANCE_MANAGER",
    canEditAccounting: (state) => state.user?.role === "ADMIN" || state.user?.role === "FINANCE_MANAGER" || state.user?.role === "ACCOUNTANT",
    canOperateCash: (state) => state.user?.role === "ADMIN" || state.user?.role === "FINANCE_MANAGER" || state.user?.role === "CASHIER",
  },
  actions: {
    async login(username: string, password: string) {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: CurrentUser; idleTimeoutMinutes: number }>("/auth/login", { username, password });
      this.applySession(data);
    },
    async refresh() {
      if (!this.refreshToken) return;
      const data = await api.post<{ accessToken: string; refreshToken: string; user: CurrentUser; idleTimeoutMinutes: number }>("/auth/refresh", { refreshToken: this.refreshToken });
      this.applySession(data);
    },
    applySession(data: { accessToken: string; refreshToken: string; user: CurrentUser; idleTimeoutMinutes: number }) {
      this.accessToken = data.accessToken; this.refreshToken = data.refreshToken; this.user = data.user; this.idleTimeoutMinutes = data.idleTimeoutMinutes;
      localStorage.setItem("finance_access_token", data.accessToken);
      localStorage.setItem("finance_refresh_token", data.refreshToken);
      localStorage.setItem("finance_user", JSON.stringify(data.user));
      localStorage.setItem("finance_idle_timeout_minutes", String(data.idleTimeoutMinutes));
      localStorage.setItem("finance_last_activity_at", String(Date.now()));
    },
    logout() {
      this.accessToken = ""; this.refreshToken = ""; this.user = null;
      this.idleTimeoutMinutes = 30;
      clearStoredSession();
    },
  },
});
