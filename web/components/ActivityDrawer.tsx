"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { api, type Escalation } from "@/lib/api";
import { clockSec, duration } from "@/lib/format";
import type { Ev, Metrics } from "@/lib/types";

const TONE: Record<string, string> = { accepted: "ok", briefing_sent: "ok", completed: "ok", backup_promoted: "ok", offered: "wait", standby_reserved: "wait", declined: "bad", expired: "bad", interpreter_cancelled: "bad", no_match: "bad" };

export function ActivityDrawer({ open, onClose, events, metrics, escalations = [], onDone }: { open: boolean; onClose: () => void; events: Ev[]; metrics?: Metrics; escalations?: Escalation[]; onDone?: () => void }) {
  const { t, lang } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  const waiting = escalations.filter(item => item.status === "pending").length;
  const number = new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-GB");
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [open]);
  return <AnimatePresence>{open && <m.aside className="drawer glass strong" aria-labelledby="activity-heading" initial={{ x: lang === "ar" ? -40 : 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="sheet-head"><div><h2 id="activity-heading">{t("Activity & support", "النشاط والدعم")}</h2><p>{waiting ? t(`${number.format(waiting)} awaiting acknowledgment`, `${number.format(waiting)} بانتظار تأكيد الاستلام`) : t("No requests awaiting acknowledgment", "لا توجد طلبات بانتظار تأكيد الاستلام")}</p></div><button ref={closeRef} className="icon-btn" aria-label={t("Close activity", "إغلاق النشاط")} onClick={onClose}><X size={18} aria-hidden /></button></div>
    <div className="activity">
      <section aria-labelledby="queue-heading"><h3 id="queue-heading">{t("Coordinator queue", "قائمة انتظار المنسق")}</h3>{escalations.length === 0 ? <p className="quiet">{t("No requests need coordinator support.", "لا توجد طلبات تحتاج إلى دعم المنسق.")}</p> : <div className="support-list">{escalations.map(item => <EscalationCard key={item.request_id} item={item} onDone={onDone} />)}</div>}</section>
      <details className="activity-disclosure"><summary>{t("Current request history", "سجل الطلب الحالي")}<span className="activity-count num">{number.format(events.length)}</span><ChevronDown size={16} aria-hidden /></summary><div className="activity-detail">{events.length === 0 && <p className="quiet">{t("No updates for the current request.", "لا توجد تحديثات للطلب الحالي.")}</p>}{[...events].reverse().map(e => <div key={e.id} className={`ev ${TONE[e.kind] ?? ""}`}><i aria-hidden /><div><p dir="auto">{e.payload.text}</p><time className="num" dateTime={new Date(e.ts * 1000).toISOString()} title={clockSec(e.ts)}>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false }).format(e.ts * 1000)}</time></div></div>)}</div></details>
      <details className="activity-disclosure"><summary>{t("Service overview", "نظرة عامة على الخدمة")}<ChevronDown size={16} aria-hidden /></summary><dl className="activity-metrics"><div><dt>{t("Total requests", "إجمالي الطلبات")}</dt><dd className="num">{metrics ? number.format(metrics.requests) : "—"}</dd></div><div><dt>{t("Median confirmation", "الوسيط الزمني للتأكيد")}</dt><dd className="num">{!metrics ? "—" : metrics.median_confirm_s == null ? t("Not yet", "ليس بعد") : duration(metrics.median_confirm_s, lang)}</dd></div><div><dt>{t("Rematches", "إعادة المطابقة")}</dt><dd className="num">{metrics ? number.format(metrics.replans) : "—"}</dd></div></dl></details>
    </div>
  </m.aside>}</AnimatePresence>;
}

function EscalationCard({ item, onDone }: { item: Escalation; onDone?: () => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Escalation | null>(null);
  const summary = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const current = item.status === "acknowledged" ? item : receipt ?? item;
  const acknowledged = current.status === "acknowledged";
  async function acknowledge(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await api.acknowledge(item.request_id, note);
      const restoreFocus = form.current?.contains(document.activeElement);
      setReceipt(saved);
      if (restoreFocus) summary.current?.focus();
      onDone?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="support-request" name="coordinator-queue"><summary ref={summary}><div className="support-identity"><div className="support-heading"><strong dir="auto">{item.requester_name || t("Resident", "طالب الخدمة")}</strong><span className={`support-status${acknowledged ? " acknowledged" : ""}`}>{acknowledged && <Check size={14} aria-hidden />}{acknowledged ? t("Acknowledged", "تم الاستلام") : t("Waiting", "بانتظار الدعم")}</span></div><bdi className="support-id num">{item.request_id}</bdi></div><ChevronDown size={16} aria-hidden /></summary>
    {acknowledged ? <div className="support-response"><p className="small muted">{t("Update shared with resident", "التحديث المشارك مع طالب الخدمة")}</p><p dir="auto">{current.note || t("No written update shared.", "لم يُشارك تحديث مكتوب.")}</p><p className="sr-only" role="status">{receipt && t("Request acknowledged.", "تم تأكيد استلام الطلب.")}</p></div> : <form ref={form} className="support-form" onSubmit={acknowledge} aria-busy={busy}><label htmlFor={`note-${item.request_id}`}>{t("Update for resident (optional)", "تحديث لطالب الخدمة (اختياري)")}</label><textarea id={`note-${item.request_id}`} dir="auto" maxLength={1000} rows={3} disabled={busy} value={note} onChange={e => setNote(e.target.value)} aria-describedby={`note-help-${item.request_id}`} /><p id={`note-help-${item.request_id}`} className="small muted">{t("Visible on their request page.", "يظهر في صفحة طلبه.")}</p><button className="btn primary" aria-disabled={busy}>{busy ? t("Saving…", "جارٍ الحفظ…") : t("Acknowledge", "تأكيد الاستلام")}</button>{error && <p className="error" role="alert">{error}</p>}</form>}
  </details>;
}
