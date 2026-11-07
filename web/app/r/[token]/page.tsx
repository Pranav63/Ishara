"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, Clock, IdCard, MapPin, RefreshCw, Video, X } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { MotionRoot } from "@/components/Motion";
import Link from "next/link";
import { AgentCompanion } from "@/components/AgentCompanion";
import { DisplaySettings, usePreferences } from "@/components/Preferences";
import { ReviewAppointment } from "@/components/ReviewAppointment";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/preferences";
import { areaName } from "@/lib/locale";
import { initials } from "@/lib/format";
import { useLive } from "@/lib/live";
import type { Snapshot } from "@/lib/types";

const T = {
  en: {
    home: "Home", reviewing: "Review your appointment details", coordinator: "Coordinator support", queued: "Your request is in the coordinator queue. It has not been acknowledged yet.", acknowledged: "A coordinator has acknowledged your request.",
    your: "Your appointment", steps: ["Message received", "Finding your interpreter", "Interpreter confirmed", "Visit complete"],
    replacing: "Finding a replacement", escalated: "No local interpreter is available", interpreter: "Your interpreter", lookFor: "Look for",
    arrives: "Planned arrival by", staff: "Show to Staff", size: "Text size", contrast: "High contrast", alertsOn: "Flash and vibrate on updates",
    alertsOff: "Alerts off", lang: "العربية", messages: "Messages", summary: "Summary of your visit", you: "You", updated: "Update",
    pending: "Not confirmed yet. You do not need to do anything.", invalid: "Could not load your appointment. Check your connection or ask the coordinator to check your link.",
    loading: "Loading your appointment…", retry: "Try again", settings: "Display settings", progress: "Progress", close: "Close",
    textOnly: "Text-first mode", textHelp: "Text-first mode is on. Flashing, vibration and video are off. All updates remain available as text.",
    offline: "Connection lost. Showing the last saved update. Arrival estimates may be out of date.",
    eta: (n: number) => `Interpreter is about ${n} ${n === 1 ? "minute" : "minutes"} away`,
    arrived: "Your interpreter has reported that they have arrived.", overdue: "The estimated arrival time has passed. Waiting for a new update.",
    noEta: "Your interpreter has not shared an arrival estimate yet.", reported: "Reported by your interpreter at",
    remote: "Remote video interpreting", remoteOpen: "Open remote interpreter service", newTab: "opens in a new tab",
    remoteHelp: "Opens the remote interpreting provider. Sign-in and service availability may apply. Opening the service does not confirm an interpreter.",
    remoteUnavailable: "Remote interpreting is not configured. Ask staff to help arrange support.",
    remoteAbout: "About Sanad Relay", noLocal: "No in-person interpreter is confirmed. You can try remote support.",
    sign: "Signed confirmation", signTranscript: "An interpreter has been confirmed for your appointment. Read their name and your appointment details on this page.",
    signMissing: "A reviewed Emirati Sign Language confirmation video is not available yet. Your written confirmation is below.",
    signFailed: "The signed video could not be played. Your written confirmation is below.",
    signNote: "This clip confirms the booking status. The interpreter’s name, date and place are in your written confirmation.",
  },
  ar: {
    home: "الرئيسية", reviewing: "راجع تفاصيل موعدك", coordinator: "دعم المنسق", queued: "طلبك في قائمة انتظار المنسق. لم يتم استلامه بعد.", acknowledged: "أكد المنسق استلام طلبك.",
    your: "موعدك", steps: ["تم استلام الرسالة", "نبحث عن مترجمك", "تم تأكيد المترجم", "اكتملت الزيارة"],
    replacing: "نبحث عن مترجم بديل", escalated: "لا يتوفر مترجم محلي حالياً", interpreter: "مترجمك", lookFor: "ابحث عن",
    arrives: "وقت الوصول المخطط", staff: "اعرض على الموظفين", size: "حجم النص", contrast: "تباين عالٍ", alertsOn: "وميض واهتزاز عند التحديث",
    alertsOff: "التنبيهات متوقفة", lang: "English", messages: "الرسائل", summary: "ملخص زيارتك", you: "أنت", updated: "تحديث",
    pending: "لم يتم التأكيد بعد. لا تحتاج إلى فعل أي شيء.", invalid: "تعذر تحميل موعدك. تحقق من اتصالك أو اطلب من المنسق التحقق من رابطك.",
    loading: "جارٍ تحميل موعدك…", retry: "حاول مرة أخرى", settings: "إعدادات العرض", progress: "التقدم", close: "إغلاق",
    textOnly: "وضع النص أولاً", textHelp: "وضع النص أولاً مفعّل. الوميض والاهتزاز والفيديو متوقفة. تبقى جميع التحديثات متاحة كنص.",
    offline: "انقطع الاتصال. نعرض آخر تحديث محفوظ. قد تكون تقديرات الوصول قديمة.",
    eta: (n: number) => `الوصول المتوقع للمترجم خلال ${new Intl.NumberFormat("ar-AE").format(n)} دقيقة تقريباً`,
    arrived: "أبلغ مترجمك عن وصوله.", overdue: "انقضى وقت الوصول المتوقع. بانتظار تحديث جديد.",
    noEta: "لم يشارك مترجمك تقديراً لوقت الوصول بعد.", reported: "أبلغ المترجم عن هذا التحديث الساعة",
    remote: "الترجمة المرئية عن بُعد", remoteOpen: "افتح خدمة الترجمة عن بُعد", newTab: "يفتح في علامة تبويب جديدة",
    remoteHelp: "يفتح مقدم خدمة الترجمة عن بُعد. قد يلزم تسجيل الدخول وتخضع الخدمة للتوفر. فتح الخدمة لا يؤكد حجز مترجم.",
    remoteUnavailable: "خدمة الترجمة عن بُعد غير مهيأة. اطلب من الموظفين المساعدة في ترتيب الدعم.",
    remoteAbout: "عن خدمة سند للتواصل المرئي", noLocal: "لم يتم تأكيد مترجم حضوري. يمكنك تجربة الدعم عن بُعد.",
    sign: "تأكيد بلغة الإشارة", signTranscript: "تم تأكيد مترجم لموعدك. اقرأ اسمه وتفاصيل موعدك في هذه الصفحة.",
    signMissing: "فيديو تأكيد مُراجع بلغة الإشارة الإماراتية غير متاح بعد. التأكيد المكتوب أدناه.",
    signFailed: "تعذر تشغيل فيديو الإشارة. التأكيد المكتوب أدناه.",
    signNote: "يؤكد هذا المقطع حالة الحجز. اسم المترجم والتاريخ والمكان في التأكيد المكتوب.",
  },
};

const fmt = (ts: number, lang: Lang, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", hour12: false, ...opts }).format(ts * 1000);
const dayTime = (ts: number, lang: Lang) => fmt(ts, lang, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const time = (ts: number, lang: Lang) => fmt(ts, lang, { hour: "2-digit", minute: "2-digit" });

function stepIndex(s: Snapshot["status"]) {
  return { parsing: 0, reviewing: 0, dispatching: 1, replanning: 1, escalated: 1, confirmed: 2, completed: 3 }[s];
}

// Deaf users cannot hear a notification sound: flash the screen and vibrate instead.
function useVisualAlert(key: string | undefined, enabled: boolean) {
  const [flash, setFlash] = useState(0);
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    if (prev.current && prev.current !== key && enabled) {
      setFlash((n) => n + 1);
      try { navigator.vibrate?.([220, 120, 220]); } catch {}
    }
    prev.current = key;
  }, [key, enabled]);
  return flash;
}

export default function Requester({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, error, refresh } = useLive(() => api.requester(token), { requesterToken: token });
  const { prefs } = usePreferences();
  const [staff, setStaff] = useState(false);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const t = T[prefs.lang];
  const flash = useVisualAlert(data ? `${data.status}:${data.assigned?.id ?? ""}:${data.arrival?.updated_at ?? ""}` : undefined, prefs.alerts && !prefs.textOnly && !prefs.reducedMotion);

  const root = "phone requester-phone";
  if (error && !data) return <main id="main" className={root} lang={prefs.lang} dir={prefs.lang === "ar" ? "rtl" : "ltr"}><div className="card"><h1>{t.invalid}</h1><button className="btn" onClick={refresh}>{t.retry}</button></div></main>;
  if (!data) return <main id="main" className={root} lang={prefs.lang} aria-busy="true"><p role="status">{t.loading}</p></main>;

  const a = data.appointment;
  const at = stepIndex(data.status);
  const who = data.assigned;
  const confirmed = data.status === "confirmed" || data.status === "completed";
  const statusText = data.status === "reviewing" ? t.reviewing : data.status === "replanning" ? t.replacing : data.status === "escalated" ? t.escalated : t.steps[at];
  const StatusIcon = confirmed ? Check : data.status === "replanning" ? RefreshCw : Clock;
  // Never show a confirmation naming an interpreter who has since cancelled.
  const conf = confirmed && data.confirmation ? (prefs.lang === "ar" ? data.confirmation.ar ?? data.confirmation.en : data.confirmation.en) : null;
  const summary = data.summary ? (prefs.lang === "ar" ? data.summary.ar ?? data.summary.en : data.summary.en) : null;
  const message = data.message.replace(/\[([A-Z_]+)\]/g, () => prefs.lang === "ar" ? "(تم حجب بيانات خاصة)" : "(private detail hidden)");
  const arrival = data.status === "confirmed" ? data.arrival : null;
  const minutes = arrival ? Math.ceil((arrival.eta - data.now) / 60) : 0;
  let arrivalText = "";
  if (who && data.status === "confirmed" && !error) {
    if (!arrival) arrivalText = t.noEta;
    else if (arrival.arrived) arrivalText = t.arrived;
    else arrivalText = minutes > 0 ? t.eta(minutes) : t.overdue;
  }

  return (
    <MotionRoot>
      <main id="main" className={root} dir={prefs.lang === "ar" ? "rtl" : "ltr"} lang={prefs.lang}>
        <AnimatePresence>
          {flash > 0 && prefs.alerts && !prefs.textOnly && !prefs.reducedMotion && (
            <m.div key={flash} className="flash" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0, 0.55, 0] }} transition={{ duration: 1.3, times: [0, 0.2, 0.45, 0.7, 1] }} />
          )}
        </AnimatePresence>

        <header className="requester-top"><Link className="brand" href="/" aria-label={t.home}><span className="brand-name" translate="no">Ishara</span><span lang="ar">إشارة</span></Link><DisplaySettings /></header>
        {data.status !== "reviewing" && <AgentCompanion status={data.status} />}
        {prefs.textOnly && <p className="small">{t.textHelp}</p>}
        {error && <p className="error" role="alert">{t.offline}</p>}

        {data.status !== "reviewing" && <section className="card status-card" role="status" aria-atomic="true">
          <span className={`status-icon${confirmed ? " ok" : data.status === "escalated" ? " bad" : ""}`} aria-hidden><StatusIcon size={26} /></span>
          <div>
            <p className="muted small">{t.your}</p>
            <h1>{statusText}</h1>
            {arrivalText && <p className="arrival-text">{arrivalText}</p>}
          </div>
        </section>}

        {data.status === "reviewing" && <section className="card requester-review"><ReviewAppointment key={data.id} snap={data} onDone={refresh} primary /><details className="review-source"><summary>{prefs.lang === "ar" ? "رسالتك الأصلية" : "Your original message"}</summary><p dir="auto">{message}</p></details></section>}

        {data.status === "escalated" && (
          <section className="card" aria-labelledby="remote-title">
            <h2>{t.coordinator}</h2>
            <p role="status">{data.escalation?.status === "acknowledged" ? t.acknowledged : t.queued}</p>
            {data.escalation?.note && <p className="coordinator-note" dir="auto">{data.escalation.note}</p>}
            <h2 id="remote-title">{t.remote}</h2>
            {data.remote_interpreter_url ? <>
              <p className="small">{t.remoteHelp}</p>
              <a className="btn primary big" href={data.remote_interpreter_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`${t.remoteOpen} (${t.newTab})`}><Video size={20} aria-hidden />{t.remoteOpen}</a>
              <a href="https://www.cda.gov.ae/en/sanad-relay-center" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t.remoteAbout}<span className="sr-only"> ({t.newTab})</span></a>
            </> : <p>{t.remoteUnavailable}</p>}
          </section>
        )}

        {data.status !== "reviewing" && <section className="card">
          <div className="fact"><MapPin size={20} aria-hidden /><span><strong>{a.entity}</strong><br /><span className="muted">{areaName(a.area, prefs.lang)}</span></span></div>
          <div className="fact"><Clock size={20} aria-hidden /><span className="num">{dayTime(a.starts_at, prefs.lang)}</span></div>
          <ol className="dots" aria-label={t.progress}>
            {t.steps.map((s, i) => <li key={s} className={i <= at ? "on" : ""} aria-current={i === at ? "step" : undefined}><span className="sr-only">{s}</span></li>)}
          </ol>
        </section>}

        {data.status !== "reviewing" && data.status !== "parsing" && <section className="card">
          <p className="muted small">{t.interpreter}</p>
          {who && confirmed ? (
            <div className="who">
              <span className="avatar xl" aria-hidden>{initials(who.name)}</span>
              <div>
                <h2>{t.lookFor} {who.name}</h2>
                <p className="muted num">{t.arrives} {time(a.starts_at - 900, prefs.lang)}</p>
                {arrival && <p className="small num">{t.reported} {time(arrival.updated_at, prefs.lang)}</p>}
              </div>
            </div>
          ) : (
            <p>{data.status === "escalated" ? t.noLocal : t.pending}</p>
          )}
          <button className="btn primary big" onClick={() => setStaff(true)}><IdCard size={20} aria-hidden />{t.staff}</button>
        </section>}

        {data.status === "confirmed" && (
          <section className="card" aria-labelledby="signed-title">
            <h2 id="signed-title">{t.sign}</h2>
            {data.confirmation_video_url && failedVideo !== data.confirmation_video_url ? <>
              {!prefs.textOnly && <video key={data.confirmation_video_url} className="sign-video" src={data.confirmation_video_url} controls playsInline preload="none" aria-label={t.sign} aria-describedby="sign-transcript sign-note" onError={() => setFailedVideo(data.confirmation_video_url)} />}
              <p id="sign-transcript">{t.signTranscript}</p>
              <p id="sign-note" className="small muted">{t.signNote}</p>
            </> : <p className="small">{data.confirmation_video_url ? t.signFailed : t.signMissing}</p>}
          </section>
        )}

        {data.status !== "reviewing" && <section className="card" aria-label={t.messages}>
          <p className="muted small">{t.messages}</p>
          <div className="bubble them" dir="auto">{message}</div>
          {conf && <div className="bubble us" lang={prefs.lang === "ar" && data.confirmation?.ar ? "ar" : "en"} dir="auto">{conf}</div>}
          {summary && <div className="bubble us" lang={prefs.lang === "ar" && data.summary?.ar ? "ar" : "en"} dir="auto"><strong>{t.summary}</strong><br />{summary}</div>}
        </section>}

        {staff && <StaffCard name={who && confirmed ? who.name : null} arrival={arrival} label={t.staff} closeLabel={t.close} onClose={() => setStaff(false)} />}
      </main>
    </MotionRoot>
  );
}

// A card the resident turns toward reception. Always bilingual, very large type.
function StaffCard({ name, arrival, label, closeLabel, onClose }: { name: string | null; arrival: Snapshot["arrival"]; label: string; closeLabel: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const estimateEn = arrival?.arrived ? "They have reported that they have arrived." : arrival ? `Their latest estimated arrival is ${time(arrival.eta, "en")}.` : "They have not shared an arrival estimate yet.";
  const estimateAr = arrival?.arrived ? "أبلغ عن وصوله." : arrival ? `آخر وقت وصول متوقع هو ${time(arrival.eta, "ar")}.` : "لم يشارك تقديراً لوقت الوصول بعد.";
  const en = name
    ? `I am Deaf and use sign language. My interpreter, ${name}, is booked for this appointment. ${estimateEn} Please wait for them before we start. You can also write to me.`
    : "I am Deaf and use sign language. My interpreter is being arranged. Please write to me until they arrive.";
  const ar = name
    ? `أنا أصم وأستخدم لغة الإشارة. مترجمي ${name} محجوز لهذا الموعد. ${estimateAr} يرجى انتظاره قبل البدء. يمكنك أيضاً الكتابة لي.`
    : "أنا أصم وأستخدم لغة الإشارة. يجري ترتيب مترجم لي. يرجى الكتابة لي حتى يصل.";
  return (
    <dialog ref={dialog} className="staff" aria-label={label} onClose={onClose}>
      <button autoFocus className="icon-btn staff-close" aria-label={closeLabel} onClick={() => dialog.current?.close()}><X size={26} aria-hidden /></button>
      <p lang="en" dir="ltr">{en}</p>
      <p lang="ar" dir="rtl">{ar}</p>
    </dialog>
  );
}
