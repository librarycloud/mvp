import { ElMessage } from "element-plus";

const baseUrl = import.meta.env.VITE_API_BASE ?? "/api/v1";
interface ApiEnvelope<T> { success: boolean; data: T; message: string; requestId?: string; error?: { code: string; message: string } }

let unauthorizedHandler: (() => void) | undefined;
let unauthorizedHandled = false;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

function handleUnauthorized(hasToken: boolean) {
  if (!hasToken || unauthorizedHandled) return;
  unauthorizedHandled = true;
  ElMessage.warning("登录已失效，请重新登录");
  unauthorizedHandler?.();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("finance_access_token");
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  } catch {
    const message = "无法连接服务器，请检查网络或后端服务是否运行";
    ElMessage.error(message);
    throw new Error(message);
  }
  const rawBody = await response.text();
  let body: ApiEnvelope<T> | null = null;
  try {
    body = rawBody ? JSON.parse(rawBody) as ApiEnvelope<T> : null;
  } catch {
    body = null;
  }
  if (response.status === 401) {
    const message = body?.error?.message ?? (token ? "登录已失效，请重新登录" : "认证失败");
    if (token) handleUnauthorized(true);
    else ElMessage.error(message);
    throw new Error(message);
  }
  if (!response.ok || !body?.success) {
    const rawMessage = rawBody
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    const message = body?.error?.message
      ?? (rawMessage || undefined)
      ?? `请求失败（HTTP ${response.status}），服务器没有返回具体错误原因`;
    const displayMessage = body?.error?.code === "INTERNAL_ERROR" && body.requestId
      ? `${message}，请求编号：${body.requestId}`
      : message;
    ElMessage.error(displayMessage);
    throw new Error(displayMessage);
  }
  unauthorizedHandled = false;
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, body === undefined
    ? { method: "POST" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => { const form = new FormData(); form.append("file", file); return request<T>(path, { method: "POST", body: form }); },
  uploadMany: <T>(path: string, files: File[]) => { const form = new FormData(); for (const file of files) form.append("file", file); return request<T>(path, { method: "POST", body: form }); },
  uploadWithFields: <T>(path: string, file: File, fields: Record<string, string | number>) => { const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.append(key, String(value)); form.append("file", file); return request<T>(path, { method: "POST", body: form }); },
  blob: async (path: string) => { const token = localStorage.getItem("finance_access_token"); const response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (response.status === 401) { handleUnauthorized(Boolean(token)); throw new Error("登录已失效，请重新登录"); } if (!response.ok) { const body = await response.json().catch(() => null) as ApiEnvelope<unknown> | null; const message = body?.error?.message ?? "读取文件失败"; ElMessage.error(message); throw new Error(message); } unauthorizedHandled = false; return response.blob(); },
  download: async (path: string, fileName: string) => { const token = localStorage.getItem("finance_access_token"); const response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (response.status === 401) { handleUnauthorized(Boolean(token)); throw new Error("登录已失效，请重新登录"); } if (!response.ok) throw new Error("下载失败"); unauthorizedHandled = false; const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url); },
};
