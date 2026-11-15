"use client";

import { m, useMotionValue, useSpring, useTransform } from "motion/react";
import { GraduationCap, Hand, IdCard, ShieldCheck, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LiquidThumb } from "@/components/LiquidThumb";
import { useLanguage, usePreferences } from "@/components/Preferences";
import { api } from "@/lib/api";
import { areaName, languageName } from "@/lib/locale";
import type { Appointment } from "@/lib/types";

// One example per kind of visit, so the pass reads as "any appointment", not "hospitals only".
const EXAMPLES = [
  { key: "hospital", Icon: Stethoscope, tab: ["Hospital", "مستشفى"], place: ["Rashid Hospital", "مستشفى راشد"], area: ["Oud Metha", "عود ميثاء"], date: ["Thu 26 Nov", "الخميس 26 نوفمبر"], time: "10:30", visit: ["Medical", "طبي"], who: ["Mariam A.", "مريم أ."], initials: "MA", note: ["Arrives 10:15. Backup ready.", "تصل 10:15. البديل جاهز."] },
  { key: "id", Icon: IdCard, tab: ["Emirates ID", "الهوية"], place: ["ICP Customer Happiness Centre", "مركز سعادة المتعاملين"], area: ["Al Barsha", "البرشاء"], date: ["Sun 29 Nov", "الأحد 29 نوفمبر"], time: "09:00", visit: ["Government", "حكومي"], who: ["Omar K.", "عمر ك."], initials: "OK", note: ["Arrives 08:45. Backup ready.", "يصل 08:45. البديل جاهز."] },
  { key: "school", Icon: GraduationCap, tab: ["School", "مدرسة"], place: ["Parent meeting, Al Safa School", "اجتماع أولياء الأمور، مدرسة الصفا"], area: ["Al Safa", "الصفا"], date: ["Tue 1 Dec", "الثلاثاء 1 ديسمبر"], time: "15:30", visit: ["Education", "تعليمي"], who: ["Sana R.", "سناء ر."], initials: "SR", note: ["Arrives 15:15. Backup ready.", "تصل 15:15. البديل جاهز."] },
] as const;

export type Reading = Appointment & { hidden: number };
const DOMAINS: Record<string, [string, string]> = { medical: ["Medical", "طبي"], legal: ["Legal", "قانوني"], government: ["Government", "حكومي"], education: ["Education", "تعليمي"], other: ["Other", "أخرى"] };

// Reads the draft as the resident types. Nothing is stored; the API only redacts and parses.
export function useDraftReading(text: string, online: boolean) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = text.trim();
  useEffect(() => {
    if (draft.length < 8 || !online) { setReading(null); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => api.parse(draft, controller.signal).then(setReading).catch(() => {}).finally(() => { if (!controller.signal.aborted) setBusy(false); }), 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, online]);
  return { reading: draft.length >= 8 ? reading : null, busy };
}

function Field({ label, value, check }: { label: string; value: string; check?: boolean }) {
  const { t } = useLanguage();
  return <div className="pass-field"><dt>{label}</dt><dd><m.span key={value} dir="auto" initial={{ opacity: 0, filter: "blur(8px)", y: 4 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>{value}</m.span>{check && <span className="pass-check">{t("Check", "تحقق")}</span>}</dd></div>;
}

// The single hero object: a glass booking pass that flips from an example to the resident's own appointment.
export function HomePreview({ reading, busy }: { reading: Reading | null; busy: boolean }) {
  const { t, lang } = useLanguage();
  const { prefs } = usePreferences();
  const still = prefs.reducedMotion || prefs.textOnly;
  const x = useMotionValue(0), y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [7, -7]), { stiffness: 140, damping: 18 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-9, 9]), { stiffness: 140, damping: 18 });
  const fmt = (opts: Intl.DateTimeFormatOptions) => reading ? new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", hour12: false, ...opts }).format(reading.starts_at * 1000) : "";
  const guessed = (...keys: string[]) => !!reading && keys.some(k => reading.assumed.includes(k));
  const domain = reading ? DOMAINS[reading.domain] ?? DOMAINS.other : null;
  const mine = reading !== null;
  const [pick, setPick] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  const ex = EXAMPLES[pick];
  const tr = (pair: readonly [string, string]) => t(pair[0], pair[1]);

  return <figure className="pass-stage" aria-labelledby="pass-caption"
    onPointerMove={e => { if (still) return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5); }}
    onPointerLeave={() => { x.set(0); y.set(0); }}>
    <figcaption id="pass-caption" className="pass-caption">{mine ? t("Your booking, as Ishara read it", "حجزك كما قرأته إشارة") : t("Any appointment. Paste the message, Ishara books the interpreter.", "أي موعد. ألصق الرسالة، وتحجز إشارة المترجم.")}</figcaption>
    {!mine && <div ref={tabs} className="pass-tabs liquid-tabs" role="tablist" aria-label={t("Example appointments", "أمثلة على المواعيد")}>
      <LiquidThumb group={tabs} index={pick} />
      {EXAMPLES.map((e, i) => <button key={e.key} type="button" role="tab" aria-selected={i === pick} aria-pressed={i === pick} onClick={() => setPick(i)}><span><e.Icon size={15} aria-hidden />{tr(e.tab)}</span></button>)}
    </div>}
    <div className="pass-float">
      <m.div className="pass-tilt" style={still ? undefined : { rotateX, rotateY }}>
        <m.div className="pass-flip" animate={{ rotateY: mine ? 180 : 0 }} transition={{ type: "spring", stiffness: 70, damping: 14 }}>
          <article className="pass" aria-hidden={mine} role={mine ? undefined : "tabpanel"}>
            <header className="pass-head"><span className="pass-mark"><Hand size={16} strokeWidth={2.4} /></span>Ishara<span className="pass-chip ok">{t("Confirmed", "مؤكد")}</span></header>
            <p className="pass-place"><m.span key={ex.key} initial={{ opacity: 0, filter: "blur(8px)", y: 6 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}>{tr(ex.place)}</m.span></p>
            <p className="pass-area">{tr(ex.area)}</p>
            <dl className="pass-grid">
              <Field label={t("Date", "التاريخ")} value={tr(ex.date)} />
              <Field label={t("Time", "الوقت")} value={ex.time} />
              <Field label={t("Visit", "الزيارة")} value={tr(ex.visit)} />
              <Field label={t("Language", "اللغة")} value={t("Emirati Sign", "الإشارة الإماراتية")} />
            </dl>
            <footer className="pass-foot"><span className="pass-avatar">{ex.initials}</span><span><strong>{tr(ex.who)}</strong><small>{tr(ex.note)}</small></span><span className="pass-tag">{t("Example", "مثال")}</span></footer>
          </article>
          <article className="pass pass-back" aria-hidden={!mine} aria-busy={busy}>
            <header className="pass-head"><span className="pass-mark"><Hand size={16} strokeWidth={2.4} /></span>Ishara<span className={`pass-chip${busy ? " reading" : ""}`}>{busy ? t("Reading", "أقرأ") : t("Ready to review", "جاهز للمراجعة")}</span></header>
            {reading && <>
              <p className="pass-place"><m.span key={reading.entity} initial={{ opacity: 0, filter: "blur(8px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} dir="auto">{reading.entity}</m.span>{guessed("venue") && <span className="pass-check">{t("Check", "تحقق")}</span>}</p>
              <p className="pass-area">{areaName(reading.area, lang)}{guessed("location") && <span className="pass-check">{t("Check", "تحقق")}</span>}</p>
              <dl className="pass-grid">
                <Field label={t("Date", "التاريخ")} value={fmt({ weekday: "short", day: "numeric", month: "short" })} check={guessed("date")} />
                <Field label={t("Time", "الوقت")} value={fmt({ hour: "2-digit", minute: "2-digit" })} check={guessed("time")} />
                <Field label={t("Visit", "الزيارة")} value={domain ? t(domain[0], domain[1]) : ""} />
                <Field label={t("Language", "اللغة")} value={languageName(reading.language, lang)} />
              </dl>
              <footer className="pass-foot"><span className="pass-shield"><ShieldCheck size={18} /></span><span><strong>{reading.hidden ? t(`${reading.hidden} private detail${reading.hidden > 1 ? "s" : ""} hidden`, `حُجب ${reading.hidden} من البيانات الخاصة`) : t("No private details found", "لا توجد بيانات خاصة")}</strong><small>{t("Nothing is sent until you confirm.", "لا يُرسل شيء قبل تأكيدك.")}</small></span></footer>
              <span key={`${reading.entity}${reading.starts_at}`} className="pass-shine" aria-hidden />
            </>}
          </article>
        </m.div>
      </m.div>
    </div>
  </figure>;
}
