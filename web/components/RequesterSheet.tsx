"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock, IdCard, MapPin, Mail, MessageCircle, MessageSquare, Phone, Plus, ShieldCheck } from "lucide-react";
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

type Availability = "checking" | "online" | "offline";

// One box: paste the message, or try an example. The name is asked for on the review step.
export function RequestComposer({ onCreated, availability = "online", onRetry, initial = "", onDraft, autoFocus = false, note }: { onCreated: (created: Snapshot) => void; availability?: Availability; onRetry?: () => void; initial?: string; onDraft?: (text: string) => void; autoFocus?: boolean; note?: React.ReactNode }) {
  const { t } = useLanguage();
  const [text, setText] = useState(initial);
  const [example, setExample] = useState(0);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { onDraft?.(text); }, [text, onDraft]);
  useEffect(() => { if (autoFocus) field.current?.focus(); }, [autoFocus]);
  const online = availability === "online";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!online || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setErr(null);
    try {
      const created = await api.create(text.trim(), "");
      rememberRequest(created.token);
      setText(""); onCreated(created);
    } catch (e) { setErr((e as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  return <form className="composer request-form" onSubmit={submit} aria-busy={busy}>
    {note}
    <div className="composer-head">
      <label htmlFor="msg">{t("Paste your appointment message", "ألصق رسالة موعدك")}</label>
      <ul className="composer-sources" aria-label={t("Works with messages from", "يعمل مع رسائل من")}>
        <li className="src-sms" title="SMS"><MessageSquare size={15} aria-hidden /><span className="sr-only">SMS</span></li>
        <li className="src-mail" title={t("Email", "البريد")}><Mail size={15} aria-hidden /><span className="sr-only">{t("Email", "البريد")}</span></li>
        <li className="src-wa" title="WhatsApp"><MessageCircle size={15} aria-hidden /><span className="sr-only">WhatsApp</span></li>
      </ul>
    </div>
    <textarea ref={field} id="msg" name="message" autoComplete="off" dir="auto" rows={3} required minLength={8} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Hospital, Emirates ID, school… any appointment", "مستشفى، هوية، مدرسة… أي موعد")} />
    <div className="composer-bar">
      <button type="button" className="composer-example" onClick={() => { setText(SAMPLES[example].text); setExample((example + 1) % SAMPLES.length); field.current?.focus(); }}>{t("Try an example", "جرّب مثالاً")}</button>
      <span className="request-privacy"><Popover up label={t("Privacy", "الخصوصية")} trigger={<ShieldCheck size={18} aria-hidden />}><div className="privacy-tip"><p>{t("Hidden before storage:", "تُحجب قبل التخزين:")}</p><ul><li><Phone size={14} aria-hidden />{t("Phone numbers", "أرقام الهاتف")}</li><li><Mail size={14} aria-hidden />{t("Emails", "البريد")}</li><li><IdCard size={14} aria-hidden />{t("ID numbers", "أرقام الهوية")}</li></ul></div></Popover></span>
      <button className="btn primary composer-send" type="submit" aria-describedby="request-service" disabled={!online || busy || text.trim().length < 8}>{availability === "checking" ? t("Checking…", "جارٍ التحقق…") : !online ? t("Offline", "غير متصل") : busy ? t("Reading…", "جارٍ القراءة…") : t("Continue", "متابعة")}{online && !busy && <ArrowRight size={18} aria-hidden />}</button>
    </div>
    <div className="request-form-foot"><p id="request-service" role="status">{availability === "offline" ? t("Service unavailable. You can keep writing.", "الخدمة غير متاحة. يمكنك متابعة الكتابة.") : ""}</p>{availability === "offline" && onRetry && <button type="button" className="request-retry" onClick={onRetry}>{t("Try again", "حاول مجدداً")}</button>}</div>
    {err && <p className="error" role="alert">{err}</p>}
  </form>;
}

export function RequesterSheet({ snap, onCreated, composer = true, compose = false, onComposeChange, availability = "online", onRetry }: { snap: Snapshot | null; onCreated: (created?: Snapshot) => void; composer?: boolean; compose?: boolean; onComposeChange?: (compose: boolean) => void; availability?: Availability; onRetry?: () => void }) {
  const { t, lang } = useLanguage();
  const [min, setMin] = useState(false);
  // The draft outlives the composer, so Cancel and New request bring it back.
  const [draft, setDraft] = useState("");
  const newRequestButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  const showForm = composer && (!snap || compose);
  const st = snap ? STATUS[snap.status] : null;
  const statusAr: Record<Snapshot["status"], string> = { parsing: "نقرأ الرسالة", reviewing: "راجع تفاصيل الموعد", dispatching: "نبحث عن مترجم", confirmed: "تم تأكيد المترجم", replanning: "نبحث عن مترجم بديل", escalated: "بانتظار دعم المنسق", completed: "اكتملت الزيارة" };

  useEffect(() => {
    if (!compose && restoreFocus.current) { newRequestButton.current?.focus(); restoreFocus.current = false; }
  }, [compose]);

  return <m.section className={`sheet glass strong${min && !showForm ? " min" : ""}${showForm ? " is-composing" : ""}`} aria-label={t("Request an interpreter", "اطلب مترجماً")} layout transition={{ type: "spring", stiffness: 400, damping: 38 }}>
    <div className="sheet-head">
      <div style={{ flex: 1, minWidth: 0 }}>{!showForm && <p className="section-kicker">{t("Resident", "طالب الخدمة")} <bdi>{snap?.id}</bdi></p>}<h2>{showForm ? t("New request", "طلب جديد") : snap?.requester_name || t("Unnamed resident", "طالب خدمة دون اسم")}</h2></div>
      {showForm && <AgentCompanion />}
      {compose && <button type="button" className="request-cancel" onClick={() => { restoreFocus.current = true; onComposeChange?.(false); }}>{t("Cancel", "إلغاء")}</button>}
      {snap && !showForm && <button className="icon-btn" aria-label={min ? t("Expand conversation", "توسيع المحادثة") : t("Collapse conversation", "طي المحادثة")} aria-expanded={!min} onClick={() => setMin((v) => !v)}><m.span animate={{ rotate: min ? 180 : 0 }} style={{ display: "inline-flex" }}><ChevronDown size={18} aria-hidden /></m.span></button>}
    </div>
    <AnimatePresence initial={false}>{(!min || showForm) && <m.div className="sheet-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {snap && st && !showForm && snap.status !== "reviewing" && <div className="appt">
        <div className="appt-row"><MapPin size={16} aria-hidden /><span>{snap.appointment.entity}</span></div>
        <div className="appt-row"><Clock size={16} aria-hidden /><span>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(snap.appointment.starts_at * 1000)}</span></div>
        <div className="appt-row"><span className={`state ${st.tone}`}>{lang === "ar" ? statusAr[snap.status] : st.label}</span></div>
      </div>}
      {snap?.status === "reviewing" && !showForm ? <div className="review-scroll"><ReviewAppointment key={snap.id} snap={snap} onDone={() => onCreated()} /></div> : snap && !showForm ? <Thread snap={snap} /> : null}
      {snap && composer && !compose && <div className="compose-bar"><Link className="btn small" href={`/r/${snap.token}`}><ArrowUpRight size={16} aria-hidden />{t("My appointment", "موعدي")}</Link><button ref={newRequestButton} className="btn small" onClick={() => onComposeChange?.(true)}><Plus size={16} aria-hidden />{t("New request", "طلب جديد")}</button></div>}
      {showForm && <RequestComposer availability={availability} onRetry={onRetry} initial={draft} onDraft={setDraft} autoFocus={compose} onCreated={onCreated} note={snap && compose && snap.status !== "completed" ? <p className="small muted">{t("Your previous request stays active. Find it in Requests.", "يبقى طلبك السابق نشطاً. يمكنك الرجوع إليه من الطلبات.")}</p> : null} />}
    </m.div>}</AnimatePresence>
  </m.section>;
}
