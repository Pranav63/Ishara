"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, MapPin, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentCompanion } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { ReviewAppointment } from "@/components/ReviewAppointment";
import { Thread } from "@/components/Thread";
import { api } from "@/lib/api";
import { SAMPLES, STATUS } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export function RequesterSheet({ snap, onCreated, composer = true, compose = false, onComposeChange, availability = "online" }: { snap: Snapshot | null; onCreated: (created?: Snapshot) => void; composer?: boolean; compose?: boolean; onComposeChange?: (compose: boolean) => void; availability?: "checking" | "online" | "offline" }) {
  const { t, lang } = useLanguage();
  const [min, setMin] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const newRequestButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const showForm = composer && (!snap || compose);
  const st = snap ? STATUS[snap.status] : null;
  const labels = [t("Hospital", "مستشفى"), t("Emirates ID", "الهوية الإماراتية"), t("School", "مدرسة")];
  const statusAr: Record<Snapshot["status"], string> = { parsing: "نقرأ الرسالة", reviewing: "راجع تفاصيل الموعد", dispatching: "نبحث عن مترجم", confirmed: "تم تأكيد المترجم", replanning: "نبحث عن مترجم بديل", escalated: "بانتظار دعم المنسق", completed: "اكتملت الزيارة" };

  useEffect(() => {
    if (compose) messageField.current?.focus();
    else if (restoreFocus.current) { newRequestButton.current?.focus(); restoreFocus.current = false; }
  }, [compose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (availability !== "online" || busy) return;
    setBusy(true); setErr(null);
    try {
      const created = await api.create(text.trim(), name.trim());
      setText(""); onCreated(created);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <m.section className={`sheet glass strong${min && !showForm ? " min" : ""}${showForm ? " is-composing" : ""}`} aria-label={t("Request an interpreter", "اطلب مترجماً")} layout transition={{ type: "spring", stiffness: 400, damping: 38 }}>
    <div className="sheet-head">
      <div style={{ flex: 1, minWidth: 0 }}>{!showForm && <p className="section-kicker">{t("Your space", "مساحتك")}</p>}<h2>{showForm ? t("New request", "طلب جديد") : snap?.requester_name || t("Request an interpreter", "اطلب مترجماً")}</h2>{showForm && <p id="msg-help">{t("Paste your SMS or email", "ألصق رسالة الموعد أو البريد")}</p>}</div>
      {showForm && <AgentCompanion compact busy={busy} />}
      {compose && <button type="button" className="request-cancel" onClick={() => { restoreFocus.current = true; onComposeChange?.(false); setErr(null); }}>{t("Cancel", "إلغاء")}</button>}
      {snap && !showForm && <button className="icon-btn" aria-label={min ? t("Expand conversation", "توسيع المحادثة") : t("Collapse conversation", "طي المحادثة")} aria-expanded={!min} onClick={() => setMin((v) => !v)}><m.span animate={{ rotate: min ? 180 : 0 }} style={{ display: "inline-flex" }}><ChevronDown size={18} aria-hidden /></m.span></button>}
    </div>
    <AnimatePresence initial={false}>{(!min || showForm) && <m.div className="sheet-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {!showForm && <AgentCompanion status={snap?.status} />}
      {snap && st && !showForm && <div className="appt">
        <div className="appt-row"><MapPin size={16} aria-hidden /><span>{snap.appointment.entity}</span></div>
        <div className="appt-row"><Clock size={16} aria-hidden /><span>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(snap.appointment.starts_at * 1000)}</span></div>
        <div className="appt-row"><span className={`state ${st.tone}`}>{lang === "ar" ? statusAr[snap.status] : st.label}</span></div>
      </div>}
      {snap?.status === "reviewing" && !showForm ? <div className="review-scroll"><ReviewAppointment key={snap.id} snap={snap} onDone={() => onCreated()} /></div> : snap && !showForm ? <Thread snap={snap} /> : null}
      {snap && composer && !compose && <div className="compose-bar"><Link className="btn small" href={`/r/${snap.token}`}><ArrowUpRight size={16} aria-hidden />{t("My appointment", "موعدي")}</Link><button ref={newRequestButton} className="btn small" onClick={() => { onComposeChange?.(true); setErr(null); }}><Plus size={16} aria-hidden />{t("New request", "طلب جديد")}</button></div>}
      {showForm && <form className="composer request-form" onSubmit={submit} aria-busy={busy}>
        <label className="sr-only" htmlFor="msg">{t("Your appointment message", "رسالة موعدك")}</label>
        <textarea ref={messageField} id="msg" name="message" autoComplete="off" aria-describedby="msg-help" dir="auto" rows={5} required minLength={8} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Place, date and time…", "المكان، والتاريخ، والوقت…")} />
        <div className="request-extras">
          <details className="request-examples" name="request-extras"><summary><span>{t("Examples", "أمثلة")}</span><ChevronDown size={16} aria-hidden /></summary><div className="request-extra-body samples" role="group" aria-label={t("Try an example", "جرب مثالاً")}>{SAMPLES.map((s, i) => <button type="button" key={s.label} className="sample" onClick={(e) => { setText(s.text); e.currentTarget.closest("details")?.removeAttribute("open"); messageField.current?.focus(); }}>{labels[i]}</button>)}</div></details>
          <details className="optional-name" name="request-extras"><summary><span>{t("Name", "الاسم")} <span className="optional-hint">{t("(optional)", "(اختياري)")}</span></span><ChevronDown size={16} aria-hidden /></summary><div className="request-extra-body"><label className="sr-only" htmlFor="requester-name">{t("Your name", "اسمك")}</label><input id="requester-name" name="name" autoComplete="given-name" dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Your name", "اسمك")} /></div></details>
        </div>
        <button className="btn primary big request-continue" type="submit" aria-describedby="request-service" disabled={availability !== "online" || busy || text.trim().length < 8}>{availability === "checking" ? t("Checking service…", "جارٍ التحقق من الخدمة…") : availability === "offline" ? t("Service unavailable", "الخدمة غير متاحة") : busy ? t("Reading your message…", "جارٍ قراءة رسالتك…") : t("Review appointment", "مراجعة الموعد")}{availability === "online" && <ArrowRight size={18} aria-hidden />}</button>
        <div className="request-form-foot"><p id="request-service" role="status">{availability === "offline" ? t("You can prepare a message. Sending is unavailable.", "يمكنك تجهيز الرسالة. الإرسال غير متاح حالياً.") : t("You review the details before we contact interpreters.", "تراجع التفاصيل قبل إرسال طلبك للمترجمين.")}</p><details className="request-privacy"><summary><ShieldCheck size={15} aria-hidden />{t("Privacy", "الخصوصية")}</summary><p>{t("Phone numbers, email addresses and ID numbers are hidden before storage.", "تُحجب أرقام الهاتف والهوية وعناوين البريد قبل التخزين.")}</p></details></div>
        {err && <p className="error" role="alert">{err}</p>}
      </form>}
    </m.div>}</AnimatePresence>
  </m.section>;
}
