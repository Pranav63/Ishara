"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { api, type Escalation } from "@/lib/api";
import { clockSec } from "@/lib/format";
import type { Ev, Metrics } from "@/lib/types";

const TONE: Record<string, string> = { accepted: "ok", briefing_sent: "ok", completed: "ok", backup_promoted: "ok", offered: "wait", standby_reserved: "wait", declined: "bad", expired: "bad", interpreter_cancelled: "bad", no_match: "bad" };

export function ActivityDrawer({ open, onClose, events, metrics, escalations = [], onDone }: { open: boolean; onClose: () => void; events: Ev[]; metrics?: Metrics; escalations?: Escalation[]; onDone?: () => void }) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [open]);
  return <AnimatePresence>{open && <m.aside className="drawer glass strong" aria-label={t("Agent activity", "نشاط الوكيل")} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="sheet-head"><div><h2>{t("Activity & support", "النشاط والدعم")}</h2><p>{t("Request decisions and coordinator queue", "قرارات الطلبات وقائمة انتظار المنسق")}</p></div><button ref={closeRef} className="icon-btn" aria-label={t("Close activity", "إغلاق النشاط")} onClick={onClose}><X size={18} aria-hidden /></button></div>
    <div className="stats"><div><b className="num">{metrics?.requests ?? 0}</b>{t("requests", "طلب")}</div><div><b className="num">{metrics?.median_confirm_s != null ? `${metrics.median_confirm_s} ${t("s", "ث")}` : t("Not yet", "ليس بعد")}</b>{t("median to confirm", "متوسط التأكيد")}</div><div><b className="num">{metrics?.replans ?? 0}</b>{t("rematches", "إعادة مطابقة")}</div></div>
    <div className="activity"><h3 className="small">{t("Coordinator queue", "قائمة انتظار المنسق")}</h3>{escalations.length === 0 && <p className="quiet">{t("No requests need coordinator support.", "لا توجد طلبات تحتاج إلى دعم المنسق.")}</p>}{escalations.map((item) => <EscalationCard key={item.request_id} item={item} onDone={onDone} />)}<h3 className="small activity-title">{t("Request history", "سجل الطلب")}</h3>{events.length === 0 && <p className="quiet">{t("No activity yet.", "لا يوجد نشاط بعد.")}</p>}{[...events].reverse().map((e) => <div key={e.id} className={`ev ${TONE[e.kind] ?? ""}`}><i aria-hidden /><div><p dir="auto">{e.payload.text}</p><time className="num">{clockSec(e.ts)}</time></div></div>)}</div>
  </m.aside>}</AnimatePresence>;
}

function EscalationCard({ item, onDone }: { item: Escalation; onDone?: () => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function acknowledge(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.acknowledge(item.request_id, note); onDone?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="escalation-card" onSubmit={acknowledge}><strong>{item.requester_name || t("Resident", "طالب الخدمة")} · <bdi>{item.request_id}</bdi></strong>{item.status === "acknowledged" ? <><p className="small"><Check size={15} aria-hidden /> {t("Acknowledged", "تم الاستلام")}</p>{item.note && <p dir="auto" className="small">{item.note}</p>}</> : <><label className="small" htmlFor={`note-${item.request_id}`}>{t("Update shared with the resident", "تحديث يُشارك مع طالب الخدمة")}</label><textarea id={`note-${item.request_id}`} dir="auto" maxLength={1000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. I am checking remote support options.", "مثال: أتحقق من خيارات الدعم عن بُعد.")} /><button className="btn small primary" disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Acknowledge request", "تأكيد استلام الطلب")}</button></>}{error && <p className="error" role="alert">{error}</p>}</form>;
}
