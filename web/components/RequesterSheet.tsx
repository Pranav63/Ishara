"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowUpRight, ChevronDown, Clock, MapPin, Plus, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentCompanion } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { ReviewAppointment } from "@/components/ReviewAppointment";
import { Thread } from "@/components/Thread";
import { api } from "@/lib/api";
import { SAMPLES, STATUS } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export function RequesterSheet({ snap, onCreated, composer = true, landing = false }: { snap: Snapshot | null; onCreated: (created?: Snapshot) => void; composer?: boolean; landing?: boolean }) {
  const { t, lang } = useLanguage();
  const [min, setMin] = useState(false);
  const [compose, setCompose] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const showForm = composer && (!snap || compose);
  const companion = <AgentCompanion status={showForm ? undefined : snap?.status} busy={busy} />;
  const st = snap ? STATUS[snap.status] : null;
  const labels = [t("Hospital", "مستشفى"), t("Emirates ID", "الهوية الإماراتية"), t("School", "مدرسة")];
  const statusAr: Record<Snapshot["status"], string> = { parsing: "نقرأ الرسالة", reviewing: "راجع تفاصيل الموعد", dispatching: "نبحث عن مترجم", confirmed: "تم تأكيد المترجم", replanning: "نبحث عن مترجم بديل", escalated: "بانتظار دعم المنسق", completed: "اكتملت الزيارة" };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const created = await api.create(text.trim(), name.trim());
      setText(""); setCompose(false); onCreated(created);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return <m.section className={`sheet glass strong${min ? " min" : ""}`} aria-label={t("Request an interpreter", "اطلب مترجماً")} layout transition={{ type: "spring", stiffness: 400, damping: 38 }}>
    <div className="sheet-head">
      <div style={{ flex: 1, minWidth: 0 }}><p className="section-kicker">{landing ? t("Start here", "ابدأ هنا") : t("Your space", "مساحتك")}</p><h2>{snap?.requester_name || t("Request an interpreter", "اطلب مترجماً")}</h2></div>
      {snap && <button className="icon-btn" aria-label={min ? t("Expand conversation", "توسيع المحادثة") : t("Collapse conversation", "طي المحادثة")} aria-expanded={!min} onClick={() => setMin((v) => !v)}><m.span animate={{ rotate: min ? 180 : 0 }} style={{ display: "inline-flex" }}><ChevronDown size={18} aria-hidden /></m.span></button>}
    </div>
    <AnimatePresence initial={false}>{!min && <m.div className="sheet-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {!landing && companion}
      {snap && st && !showForm && <div className="appt">
        <div className="appt-row"><MapPin size={16} aria-hidden /><span>{snap.appointment.entity}</span></div>
        <div className="appt-row"><Clock size={16} aria-hidden /><span>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(snap.appointment.starts_at * 1000)}</span></div>
        <div className="appt-row"><span className={`state ${st.tone}`}>{lang === "ar" ? statusAr[snap.status] : st.label}</span></div>
      </div>}
      {snap?.status === "reviewing" && !showForm ? <div className="review-scroll"><ReviewAppointment key={snap.id} snap={snap} onDone={() => onCreated()} /></div> : snap && !showForm ? <Thread snap={snap} /> : null}
      {snap && composer && !compose && <div className="compose-bar"><Link className="btn small" href={`/r/${snap.token}`}><ArrowUpRight size={16} aria-hidden />{t("My appointment", "موعدي")}</Link><button className="btn small" onClick={() => setCompose(true)}><Plus size={16} aria-hidden />{t("New request", "طلب جديد")}</button></div>}
      {showForm && <form className="composer" onSubmit={submit}>
        <label htmlFor="msg">{t("Your appointment message", "رسالة موعدك")}</label>
        <p className="small muted" id="msg-help">{t("Paste the SMS or email with your place, date and time. You’ll review the details next.", "ألصق الرسالة النصية أو البريد الذي يتضمن المكان والتاريخ والوقت. ستراجع التفاصيل في الخطوة التالية.")}</p>
        <textarea id="msg" name="message" autoComplete="off" aria-describedby="msg-help" dir="auto" rows={4} required minLength={8} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("e.g. My appointment is at Rashid Hospital, Oud Metha, 12 November at 10:30 AM…", "مثال: موعدي في مستشفى راشد، عود ميثاء، 12 نوفمبر الساعة 10:30 صباحاً…")} />
        <div className="samples" role="group" aria-label={t("Try an example", "جرب مثالاً")}><span className="small muted">{t("Try:", "جرب:")}</span>{SAMPLES.map((s, i) => <button type="button" key={s.label} className="sample" onClick={() => setText(s.text)}>{labels[i]}</button>)}</div>
        <details className="optional-name"><summary>{t("Add your name (optional)", "أضف اسمك (اختياري)")}</summary><label className="sr-only" htmlFor="requester-name">{t("Your name", "اسمك")}</label><input id="requester-name" name="name" autoComplete="given-name" dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("How should we address you?", "بأي اسم نناديك؟")} /></details>
        <button className="btn primary big" type="submit" disabled={busy || text.trim().length < 8}><Send size={17} aria-hidden />{busy ? t("Reading your message…", "جارٍ قراءة رسالتك…") : t("Review my appointment", "راجع موعدي")}</button>
        <p className="privacy"><ShieldCheck size={16} aria-hidden />{t("Phone, email and ID numbers are hidden before storage.", "تُحجب أرقام الهاتف والهوية والبريد قبل التخزين.")}</p>
        {compose && <button type="button" className="btn small" onClick={() => setCompose(false)}>{t("Back to my request", "العودة إلى طلبي")}</button>}
        {err && <p className="error" role="alert">{err}</p>}
      </form>}
      {landing && companion}
    </m.div>}</AnimatePresence>
  </m.section>;
}
