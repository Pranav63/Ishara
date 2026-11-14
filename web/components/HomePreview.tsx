"use client";

import { m, useMotionValue, useSpring, useTransform } from "motion/react";
import { Hand, Play, ShieldCheck } from "lucide-react";
import { Journey } from "@/components/Journey";
import { useEffect, useState } from "react";
import { useLanguage, usePreferences } from "@/components/Preferences";
import { api } from "@/lib/api";
import { areaName, languageName } from "@/lib/locale";
import type { Appointment } from "@/lib/types";

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
  const [journey, setJourney] = useState(false);
  useEffect(() => { if (mine) setJourney(false); }, [mine]);
  const showJourney = journey && !mine;

  return <figure className="pass-stage" aria-labelledby="pass-caption"
    onPointerMove={e => { if (still) return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5); }}
    onPointerLeave={() => { x.set(0); y.set(0); }}>
    <figcaption id="pass-caption" className={showJourney ? "sr-only" : "pass-caption"}>{mine ? t("Your booking, as Ishara read it", "حجزك كما قرأته إشارة") : t("Paste a message. Ishara turns it into a booking.", "ألصق رسالة، وتحوّلها إشارة إلى حجز.")}</figcaption>
    {showJourney ? <Journey onExit={() => setJourney(false)} /> : <>
    {!mine && <button type="button" className="journey-start" onClick={() => setJourney(true)}><Play size={15} aria-hidden />{t("See the journey", "شاهد الرحلة")}</button>}
    <div className="pass-float" onClick={() => { if (!mine) setJourney(true); }}>
      <m.div className="pass-tilt" style={still ? undefined : { rotateX, rotateY }}>
        <m.div className="pass-flip" animate={{ rotateY: mine ? 180 : 0 }} transition={{ type: "spring", stiffness: 70, damping: 14 }}>
          <article className="pass" aria-hidden={mine}>
            <header className="pass-head"><span className="pass-mark"><Hand size={16} strokeWidth={2.4} /></span>Ishara<span className="pass-chip ok">{t("Confirmed", "مؤكد")}</span></header>
            <p className="pass-place">{t("Rashid Hospital", "مستشفى راشد")}</p>
            <p className="pass-area">{t("Oud Metha", "عود ميثاء")}</p>
            <dl className="pass-grid">
              <Field label={t("Date", "التاريخ")} value={t("Thu 26 Nov", "الخميس 26 نوفمبر")} />
              <Field label={t("Time", "الوقت")} value="10:30" />
              <Field label={t("Visit", "الزيارة")} value={t("Medical", "طبي")} />
              <Field label={t("Language", "اللغة")} value={t("Emirati Sign", "الإشارة الإماراتية")} />
            </dl>
            <footer className="pass-foot"><span className="pass-avatar">MA</span><span><strong>{t("Mariam A.", "مريم أ.")}</strong><small>{t("Arrives 10:15. Backup ready.", "تصل 10:15. البديل جاهز.")}</small></span><span className="pass-tag">{t("Example", "مثال")}</span></footer>
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
    </>}
  </figure>;
}
