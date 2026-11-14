"use client";

import { AnimatePresence, m, useIsPresent, type Variants } from "motion/react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, MessagesSquare, Navigation, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentOrb } from "@/components/AgentCompanion";
import { useLanguage, usePreferences } from "@/components/Preferences";

const STEP_MS = 3600;
export type T = (en: string, ar: string) => string;

// Each chapter: what the resident sees, and what the agent is doing meanwhile.
export const CHAPTERS: { title: [string, string]; backstage: [string, string]; orb: string }[] = [
  { title: ["You paste the message", "تلصق رسالة موعدك"], backstage: ["is reading it and hiding phone numbers.", "تقرأ الرسالة وتحجب أرقام الهاتف."], orb: "parsing" },
  { title: ["You check the details", "تراجع التفاصيل"], backstage: ["waits for your OK. Nothing is sent yet.", "تنتظر موافقتك. لم يُرسل شيء بعد."], orb: "reviewing" },
  { title: ["Ishara finds your interpreter", "تجد إشارة مترجمك"], backstage: ["offers it to 3 certified interpreters, closest first.", "تعرض الطلب على 3 مترجمين معتمدين، الأقرب أولاً."], orb: "dispatching" },
  { title: ["Mariam is confirmed", "تأكد حضور مريم"], backstage: ["briefs Mariam and keeps Omar on standby.", "ترسل ملخصاً لمريم وتبقي عمر احتياطياً."], orb: "confirmed" },
  { title: ["You’re ready", "أنت جاهز"], backstage: ["keeps watch. If anyone cancels, it finds a replacement.", "تراقب الموعد. إذا اعتذر أحد، تجد بديلاً."], orb: "confirmed" },
];

const pop: Variants = { off: { opacity: 0, scale: 0.6, y: 6 }, on: (i: number) => ({ opacity: 1, scale: 1, y: 0, transition: { delay: 0.35 + i * 0.32, type: "spring", stiffness: 320, damping: 20 } }) };

export function Visual({ step, active, t }: { step: number; active: boolean; t: T }) {
  const state = active ? "on" : "off";
  if (step === 0) return <p className="j-bubble" dir="auto">
    {t("Dubai Health: your appointment at ", "دبي الصحية: موعدك في ")}<m.mark variants={{ off: { backgroundSize: "0% 100%" }, on: { backgroundSize: "100% 100%", transition: { delay: 0.5, duration: 0.6 } } }} initial="off" animate={state}>{t("Rashid Hospital", "مستشفى راشد")}</m.mark>
    {t(", ", "، ")}<m.mark variants={{ off: { backgroundSize: "0% 100%" }, on: { backgroundSize: "100% 100%", transition: { delay: 1.1, duration: 0.6 } } }} initial="off" animate={state}>{t("Thursday 10:30", "الخميس 10:30")}</m.mark>
    {t(". Call ", ". للتواصل ")}<m.span className="j-redact" variants={{ off: { opacity: 0.2, filter: "blur(4px)" }, on: { opacity: 1, filter: "blur(0px)", transition: { delay: 1.7, duration: 0.5 } } }} initial="off" animate={state}>{t("number hidden", "رقم محجوب")}</m.span>
  </p>;
  if (step === 1) return <ul className="j-checks">
    {[t("Rashid Hospital, Oud Metha", "مستشفى راشد، عود ميثاء"), t("Thursday 26 Nov, 10:30", "الخميس 26 نوفمبر، 10:30"), t("Emirati Sign Language", "لغة الإشارة الإماراتية")].map((row, i) =>
      <li key={row}><m.span className="j-tick" custom={i} variants={pop} initial="off" animate={state}><Check size={14} strokeWidth={3} /></m.span>{row}</li>)}
  </ul>;
  if (step === 2) return <ul className="j-people">
    {[["MA", t("Mariam A.", "مريم أ."), t("8 min", "8 د")], ["OK", t("Omar K.", "عمر ك."), t("16 min", "16 د")], ["SR", t("Sana R.", "سناء ر."), t("25 min", "25 د")]].map(([initials, name, far], i) =>
      <m.li key={initials} custom={i} variants={pop} initial="off" animate={state} className={i === 0 ? "best" : undefined}><span className="j-avatar">{initials}</span><strong>{name}</strong><small>{far}</small></m.li>)}
  </ul>;
  if (step === 3) return <div className="j-confirm">
    <m.span className="j-bloom" variants={{ off: { scale: 0.4, opacity: 0 }, on: { scale: 1, opacity: 1, transition: { delay: 0.3, type: "spring", stiffness: 260, damping: 15 } } }} initial="off" animate={state}><Check size={34} strokeWidth={3} /></m.span>
    <m.p custom={1} variants={pop} initial="off" animate={state}><strong>{t("Mariam A.", "مريم أ.")}</strong> {t("arrives 10:15", "تصل 10:15")}</m.p>
    <m.small custom={2} variants={pop} initial="off" animate={state}>{t("Backup: Omar K.", "الاحتياطي: عمر ك.")}</m.small>
  </div>;
  return <ul className="j-ready">
    {[[CalendarPlus, t("Calendar", "التقويم")], [Navigation, t("Directions", "الاتجاهات")], [MessagesSquare, t("Conversation", "المحادثة")]].map(([Icon, label], i) => { const I = Icon as typeof Check; return <m.li key={label as string} custom={i} variants={pop} initial="off" animate={state}><I size={24} />{label as string}</m.li>; })}
  </ul>;
}

export const card: Variants = {
  enter: (dir: number) => dir < 0 ? { opacity: 0, rotateY: -100, x: -140 } : { opacity: 0, y: 50, scale: 0.86 },
  exit: (dir: number) => dir > 0 ? { opacity: 0, rotateY: -100, x: -140, transition: { duration: 0.55, ease: [0.32, 0.72, 0, 1] } } : { opacity: 0, y: 50, scale: 0.86, transition: { duration: 0.3 } },
};

// A card that is flipping away is no longer the current card, even while it animates out.
function DeckCard({ depth, dir, children }: { depth: number; dir: number; children: React.ReactNode }) {
  const present = useIsPresent();
  return <m.article className="deck-card" aria-hidden={!present || depth !== 0} custom={dir} variants={card} initial="enter" exit="exit"
    animate={{ opacity: depth === 0 ? 1 : 0.5 - depth * 0.15, y: depth * -18, scale: 1 - depth * 0.06, x: 0, rotateY: 0 }}
    transition={{ type: "spring", stiffness: 170, damping: 22 }} style={{ zIndex: 10 - depth }}>{children}</m.article>;
}

export function Journey({ onExit }: { onExit: () => void }) {
  const { t } = useLanguage();
  const { prefs } = usePreferences();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(true);
  const last = CHAPTERS.length - 1;
  useEffect(() => setStill(prefs.reducedMotion || prefs.textOnly || window.matchMedia("(prefers-reduced-motion: reduce)").matches), [prefs.reducedMotion, prefs.textOnly]);
  const playing = !still && !paused && step < last;
  useEffect(() => { if (!playing) return; const id = setTimeout(() => { setDir(1); setStep(s => s + 1); }, STEP_MS); return () => clearTimeout(id); }, [playing, step]);
  const go = (to: number) => { if (to < 0 || to > last) return; setDir(to > step ? 1 : -1); setStep(to); };
  const chapter = CHAPTERS[step];

  return <div className="journey" role="group" aria-roledescription={t("story", "قصة")} aria-label={t("How a request works", "كيف يعمل الطلب")}
    onKeyDown={e => { if (e.key === "ArrowRight") go(step + (document.dir === "rtl" ? -1 : 1)); if (e.key === "ArrowLeft") go(step + (document.dir === "rtl" ? 1 : -1)); if (e.key === "Escape") onExit(); }}>
    <ol className="journey-progress" aria-hidden>
      {CHAPTERS.map((_, i) => <li key={i} className={i < step || (i === last && step === last) ? "done" : i === step ? "now" : undefined}><span key={`${step}-${paused}`} style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: playing ? "running" : "paused" }} /></li>)}
    </ol>
    <p className="sr-only" aria-live="polite">{t(`Step ${step + 1} of ${CHAPTERS.length}: ${chapter.title[0]}`, `الخطوة ${step + 1} من ${CHAPTERS.length}: ${chapter.title[1]}`)}</p>
    <div className="deck" onClick={() => go(step + 1)}>
      <AnimatePresence initial={false} custom={dir}>
        {CHAPTERS.map((c, i) => {
          const depth = i - step;
          if (depth < 0 || depth > 2) return null;
          return <DeckCard key={i} depth={depth} dir={dir}>
            <h3>{t(c.title[0], c.title[1])}</h3>
            <Visual step={i} active={depth === 0} t={t} />
          </DeckCard>;
        })}
      </AnimatePresence>
    </div>
    <div className="backstage" aria-live="polite">
      <AgentOrb state={chapter.orb} />
      <AnimatePresence mode="wait" initial={false}>
        <m.p key={step} initial={{ opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(4px)" }} transition={{ duration: 0.3 }}>
          <span>{t("Meanwhile, Ishara", "في الأثناء، إشارة")}</span> {t(chapter.backstage[0], chapter.backstage[1])}
        </m.p>
      </AnimatePresence>
    </div>
    <div className="journey-controls">
      <button type="button" className="j-btn" aria-label={t("Previous step", "الخطوة السابقة")} disabled={step === 0} onClick={() => go(step - 1)}><ChevronLeft size={20} aria-hidden /></button>
      {step < last
        ? !still && <button type="button" className="j-btn" aria-label={paused ? t("Play", "تشغيل") : t("Pause", "إيقاف مؤقت")} onClick={() => setPaused(p => !p)}>{paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}</button>
        : <button type="button" className="j-btn wide" onClick={() => { setDir(-1); setStep(0); setPaused(false); }}><RotateCcw size={16} aria-hidden />{t("Replay", "إعادة")}</button>}
      <button type="button" className="j-btn" aria-label={t("Next step", "الخطوة التالية")} disabled={step === last} onClick={() => go(step + 1)}><ChevronRight size={20} aria-hidden /></button>
      <button type="button" className="j-btn close" aria-label={t("Close the journey", "إغلاق القصة")} onClick={onExit}><X size={18} aria-hidden /></button>
    </div>
  </div>;
}
