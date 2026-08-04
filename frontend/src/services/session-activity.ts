import { ElMessage } from "element-plus";
import type { Router } from "vue-router";
import { useAuthStore } from "../stores/auth";

const LAST_ACTIVITY_KEY = "finance_last_activity_at";
const REFRESH_INTERVAL_MS = 60_000;

export function startSessionActivityMonitor(router: Router) {
  const auth = useAuthStore();
  let lastRenewedAt = 0;
  let refreshing = false;

  const signOutForIdle = () => {
    if (!auth.loggedIn) return;
    auth.logout();
    ElMessage.warning("因长时间无操作，您已自动退出登录");
    if (router.currentRoute.value.path !== "/login") void router.replace("/login");
  };

  const lastActivity = () => {
    const timestamp = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
    const now = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    return now;
  };
  const isIdle = () => Date.now() - lastActivity() >= auth.idleTimeoutMinutes * 60_000;

  const renew = async () => {
    if (refreshing || !auth.loggedIn || Date.now() - lastRenewedAt < REFRESH_INTERVAL_MS) return;
    refreshing = true;
    try {
      await auth.refresh();
      lastRenewedAt = Date.now();
    } catch {
      // The API client handles an invalid or expired session consistently.
    } finally {
      refreshing = false;
    }
  };

  const recordActivity = () => {
    if (!auth.loggedIn) return;
    if (isIdle()) { signOutForIdle(); return; }
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    void renew();
  };

  for (const event of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const) {
    window.addEventListener(event, recordActivity, { passive: true });
  }
  window.addEventListener("focus", recordActivity);
  window.setInterval(() => {
    if (!auth.loggedIn) return;
    if (isIdle()) {
      signOutForIdle();
      return;
    }
    // Keep a working session alive before the short-lived access token expires.
    void renew();
  }, 1_000);
  window.addEventListener("storage", (event) => { if (event.key === "finance_access_token" && !event.newValue) signOutForIdle(); });
  if (auth.loggedIn && !lastActivity()) localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}
