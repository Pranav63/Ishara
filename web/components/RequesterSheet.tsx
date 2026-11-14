"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, GraduationCap, IdCard, MapPin, Mail, Phone, Plus, ShieldCheck, Stethoscope } from "lucide-react";

const SAMPLE_ICONS = [Stethoscope, IdCard, GraduationCap];
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentCompanion } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { Popover } from "@/components/ui";
import { ReviewAppointment } from "@/components/ReviewAppointment";
import { Thread } from "@/components/Thread";
import { rememberRequest } from "@/lib/request-history";
import { api } from "@/lib/api";
import { SAMPLES, STATUS } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export function RequesterSheet({ snap, onCreated, composer = true, compose = false, onComposeChange, availability = "online", onRetry, onDraft, reading = false }: { snap: Snapshot | null; onCreated: (created?: Snapshot) => void; composer?: boolean; compose?: boolean; onComposeChange?: (compose: boolean) => void; availability?: "checking" | "online" | "offline"; onRetry?: () => void; onDraft?: (text: string) => void; reading?: boolean }) {
  const { t, lang } = useLanguage();
  const [min, setMin] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const newRequestButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => { onDraft?.(text); }, [text, onDraft]);

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
    if (availability !== "online" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setErr(null);
    try {
      const created = await api.create(text.trim(), name.trim());
      rememberRequest(created.token);
      setText(""); onCreated(created);
    } catch (e) { setErr((e as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  return <m.section className={`sheet glass strong${min && !showForm ? " min" : ""}${showForm ? " is-composing" : ""}${reading ? " is-reading" : ""}`} aria-label={t("Request an interpreter", "اطلب مترجماً")} layout transition={{ type: "spring", stiffness: 400, damping: 38 }}>
    <div className="sheet-head">
      <div style={{ flex: 1, minWidth: 0 }}>{!showForm && <p className="section-kicker">{t("Resident", "طالب الخدمة")} <bdi>{snap?.id}</bdi></p>}<h2>{showForm ? t("New request", "طلب جديد") : snap?.requester_name || t("Unnamed resident", "طالب خدمة دون اسم")}</h2>{showForm && <label htmlFor="msg">{t("Your appointment message", "رسالة موعدك")}</label>}{reading && <span className="reading-status" aria-hidden>{t("Ishara is reading", "إشارة تقرأ")}</span>}</div>
      {showForm && <AgentCompanion busy={busy || reading} />}
      {compose && <button type="button" className="request-cancel" onClick={() => { restoreFocus.current = true; onComposeChange?.(false); setErr(null); }}>{t("Cancel", "إلغاء")}</button>}
      {snap && !showForm && <button className="icon-btn" aria-label={min ? t("Expand conversation", "توسيع المحادثة") : t("Collapse conversation", "طي المحادثة")} aria-expanded={!min} onClick={() => setMin((v) => !v)}><m.span animate={{ rotate: min ? 180 : 0 }} style={{ display: "inline-flex" }}><ChevronDown size={18} aria-hidden /></m.span></button>}
    </div>
    <AnimatePresence initial={false}>{(!min || showForm) && <m.div className="sheet-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {snap && st && !showForm && snap.status !== "reviewing" && <div className="appt">
        <div className="appt-row"><MapPin size={16} aria-hidden /><span>{snap.appointment.entity}</span></div>
        <div className="appt-row"><Clock size={16} aria-hidden /><span>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(snap.appointment.starts_at * 1000)}</span></div>
        <div className="appt-row"><span className={`state ${st.tone}`}>{lang === "ar" ? statusAr[snap.status] : st.label}</span></div>
      </div>}
      {snap?.status === "reviewing" && !showForm ? <div className="review-scroll"><ReviewAppointment key={snap.id} snap={snap} onDone={() => onCreated()} /></div> : snap && !showForm ? <Thread snap={snap} /> : null}
      {snap && composer && !compose && <div className="compose-bar"><Link className="btn small" href={`/r/${snap.token}`}><ArrowUpRight size={16} aria-hidden />{t("My appointment", "موعدي")}</Link><button ref={newRequestButton} className="btn small" onClick={() => { onComposeChange?.(true); setErr(null); }}><Plus size={16} aria-hidden />{t("New request", "طلب جديد")}</button></div>}
      {showForm && <form className="composer request-form" onSubmit={submit} aria-busy={busy}>
        {snap && compose && snap.status !== "completed" && <p className="small muted">{t("Your previous request stays active. Find it in Requests.", "يبقى طلبك السابق نشطاً. يمكنك الرجوع إليه من الطلبات.")}</p>}
        <div className="message-field">
          <textarea ref={messageField} id="msg" name="message" autoComplete="off" dir="auto" rows={4} required minLength={8} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("e.g. Your appointment at Rashid Hospital is on Thursday at 10:30 AM.", "مثال: موعدك في مستشفى راشد يوم الخميس الساعة 10:30 صباحاً.")} />
        </div>
        <div className="request-examples" role="group" aria-label={t("Try an example", "جرب مثالاً")}>
          <span className="examples-label" aria-hidden>{t("Or try", "أو جرّب")}</span>
          {SAMPLES.map((s, i) => { const Icon = SAMPLE_ICONS[i]; return <button type="button" key={s.label} className="sample" onClick={() => { setText(s.text); messageField.current?.focus(); }}><Icon size={16} aria-hidden />{labels[i]}</button>; })}
        </div>
        <div className="request-options">
          <details className="optional-name"><summary><Plus size={16} aria-hidden />{t("Add your name", "أضف اسمك")} <span className="optional-hint">{t("(optional)", "(اختياري)")}</span></summary><div className="request-extra-body"><label className="sr-only" htmlFor="requester-name">{t("Your name", "اسمك")}</label><input id="requester-name" name="name" autoComplete="given-name" dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Your name", "اسمك")} /></div></details>
          <span className="request-privacy"><Popover up align="end" label={t("Privacy", "الخصوصية")} trigger={<><ShieldCheck size={15} aria-hidden />{t("Privacy", "الخصوصية")}</>}><div className="privacy-tip"><p>{t("Hidden before storage:", "تُحجب قبل التخزين:")}</p><ul><li><Phone size={14} aria-hidden />{t("Phone numbers", "أرقام الهاتف")}</li><li><Mail size={14} aria-hidden />{t("Emails", "البريد")}</li><li><IdCard size={14} aria-hidden />{t("ID numbers", "أرقام الهوية")}</li></ul></div></Popover></span>
        </div>
        <button className="btn primary big request-continue" type="submit" aria-describedby="request-service" disabled={availability !== "online" || busy || text.trim().length < 8}>{availability === "checking" ? t("Checking service…", "جارٍ التحقق من الخدمة…") : availability === "offline" ? t("Service unavailable", "الخدمة غير متاحة") : busy ? t("Reading your message…", "جارٍ قراءة رسالتك…") : t("Review appointment", "مراجعة الموعد")}{availability === "online" && <ArrowRight size={18} aria-hidden />}</button>
        <div className="request-form-foot"><p id="request-service" role="status">{availability === "offline" ? t("Service unavailable. You can keep writing.", "الخدمة غير متاحة. يمكنك متابعة الكتابة.") : ""}</p>{availability === "offline" && onRetry && <button type="button" className="request-retry" onClick={onRetry}>{t("Try again", "حاول مجدداً")}</button>}</div>
        {err && <p className="error" role="alert">{err}</p>}
      </form>}
    </m.div>}</AnimatePresence>
  </m.section>;
}
