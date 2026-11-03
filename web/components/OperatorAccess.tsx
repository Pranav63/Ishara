"use client";

import { LockKeyhole } from "lucide-react";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { api, type OperatorSession } from "@/lib/api";

export function OperatorAccess({ session, onChange, authRequired = true }: { session: OperatorSession | null; onChange: (s: OperatorSession) => void; authRequired?: boolean }) {
  const { t } = useLanguage();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  async function login(e: React.FormEvent, close: () => void) {
    e.preventDefault(); setBusy(true); setError(null);
    try { onChange(await api.login(key)); setKey(""); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError(null);
    try { await api.logout(); onChange({ authenticated: false, demo: false }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (session?.authenticated && session.demo && !authRequired) return <span className="workspace-label">{t("Demo workspace", "مساحة تجريبية")}</span>;
  if (session?.authenticated) return <div><button className="btn small" disabled={busy} onClick={logout}>{t("Sign out", "تسجيل الخروج")}</button>{error && <span className="error small" role="alert">{error}</span>}</div>;
  return <details ref={details} className="workspace-login"><summary><LockKeyhole size={18} aria-hidden />{t("Coordinator sign in", "دخول المنسق")}</summary><form className="display-settings" onSubmit={(e) => login(e, () => details.current?.removeAttribute("open"))}><p className="small muted">{t("Use the access key supplied by your service administrator.", "استخدم مفتاح الوصول الذي يوفره مسؤول الخدمة.")}</p><label htmlFor="operator-key">{t("Access key", "مفتاح الوصول")}</label><input id="operator-key" type="password" autoComplete="current-password" required value={key} onChange={(e) => setKey(e.target.value)} /><button className="btn primary" disabled={busy}>{busy ? t("Signing in…", "جارٍ الدخول…") : t("Sign in", "تسجيل الدخول")}</button>{error && <p className="error" role="alert">{error}</p>}</form></details>;
}
