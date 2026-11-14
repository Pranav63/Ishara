"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, ScanText, Users } from "lucide-react";
import { useState } from "react";
import { AgentOrb } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";

const STEPS = [
  { key: "read", state: "parsing", Icon: ScanText, label: ["Reads", "تقرأ"], title: ["Appointment read", "قرأتُ الموعد"], note: ["Rashid Hospital, Thursday 10:30", "مستشفى راشد، الخميس 10:30"] },
  { key: "match", state: "dispatching", Icon: Users, label: ["Matches", "تطابق"], title: ["Offered to 3 interpreters", "عرضتُه على 3 مترجمين"], note: ["Certified, closest first", "معتمدون، والأقرب أولاً"] },
  { key: "confirm", state: "confirmed", Icon: Check, label: ["Confirms", "تؤكد"], title: ["Mariam A. is confirmed", "تأكد حضور مريم أ."], note: ["Arrives 10:15. A backup is ready.", "تصل 10:15. والبديل جاهز."] },
] as const;

// One calm example of the agent at work. Nothing plays by itself; the resident steps through it.
export function HomePreview() {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  return <figure className="home-visual" aria-labelledby="home-visual-caption">
    <figcaption id="home-visual-caption">{t("Example request", "مثال على طلب")}</figcaption>
    <div className="hero-stage" data-state={step.state}>
      <div className="hero-orb"><AgentOrb state={step.state} /></div>
      <div className="island" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step.key} className="island-row" initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}>
            <span className="island-icon" aria-hidden><step.Icon size={18} strokeWidth={2.4} /></span>
            <span className="island-text"><strong>{t(step.title[0], step.title[1])}</strong><small>{t(step.note[0], step.note[1])}</small></span>
          </m.div>
        </AnimatePresence>
      </div>
    </div>
    <div className="hero-steps" role="group" aria-label={t("Example steps", "خطوات المثال")}>
      {STEPS.map((item, i) => <button key={item.key} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
        {i === index && <m.span layoutId="hero-step" className="hero-step-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
        <span>{t(item.label[0], item.label[1])}</span>
      </button>)}
    </div>
  </figure>;
}
