import type { Appointment, Config, Interp, InterpreterView, Metrics, Snapshot } from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "";
export type OperatorSession = { authenticated: boolean; demo: boolean };
export type Escalation = { request_id: string; status: "pending" | "acknowledged"; requester_name?: string; created_at: number; acknowledged_at: number | null; note: string | null };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, { cache: "no-store", credentials: "include", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  } catch { throw new Error("Connection unavailable. Please try again. / الاتصال غير متاح. يرجى المحاولة مجدداً."); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const arabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
    const detail = typeof body.detail === "string" ? body.detail : null;
    if (arabic) {
      const message = response.status === 401 || response.status === 403 ? "يرجى التحقق من مفتاح الوصول أو تسجيل الدخول مجدداً." : response.status === 422 ? "يرجى التحقق من تفاصيل الموعد. اختر وقتاً مستقبلياً خلال السنة القادمة." : response.status === 409 ? "تغيرت حالة الطلب. يرجى تحديث الصفحة والمحاولة مجدداً." : response.status === 429 ? "طلبات كثيرة حالياً. انتظر قليلاً ثم حاول مجدداً." : response.status === 404 ? "تعذر العثور على الطلب أو الخدمة. تحقق من الرابط أو اطلب المساعدة من المنسق." : "الخدمة غير متاحة حالياً. يرجى المحاولة مجدداً.";
      throw new Error(message);
    }
    throw new Error(detail ?? (response.status === 422 ? "Please check the appointment details." : "The service is unavailable. Please try again."));
  }
  return response.json();
}

const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  latest: () => call<Snapshot | null>("/api/requests/latest"),
  interpreters: () => call<Interp[]>("/api/interpreters"),
  metrics: () => call<Metrics>("/api/metrics"),
  places: () => call<Record<string, [number, number]>>("/api/places"),
  config: () => call<Config>("/api/config"),
  create: (text: string, requester_name: string) => post<Snapshot>("/api/requests", { text, requester_name }),
  approve: (token: string, appointment: Pick<Appointment, "entity" | "area" | "starts_at" | "duration_min" | "domain" | "language">) => post<Snapshot>(`/api/r/${token}/approve`, appointment),
  requester: (token: string) => call<Snapshot>(`/api/r/${token}`),
  interpreter: (token: string) => call<InterpreterView>(`/api/i/${token}`),
  session: () => call<OperatorSession>("/api/operator/session"),
  login: (key: string) => post<OperatorSession>("/api/operator/session", { key }),
  logout: () => call<{ ok: boolean }>("/api/operator/session", { method: "DELETE" }),
  escalations: () => call<Escalation[]>("/api/escalations"),
  acknowledge: (rid: string, note: string) => post<Escalation>(`/api/escalations/${rid}/acknowledge`, { note }),
  accept: (token: string, oid: number) => post(`/api/i/${token}/offers/${oid}/accept`),
  decline: (token: string, oid: number) => post(`/api/i/${token}/offers/${oid}/decline`),
  cancel: (token: string, rid: string) => post(`/api/i/${token}/requests/${rid}/cancel`),
  arrival: (token: string, rid: string, minutes: number) => post(`/api/i/${token}/requests/${rid}/arrival`, { minutes }),
  complete: (token: string, rid: string, notes: string) => post(`/api/i/${token}/requests/${rid}/complete`, { notes }),
  reset: () => post("/api/demo/reset"),
};
