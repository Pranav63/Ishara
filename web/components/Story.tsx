"use client";

import { AnimatePresence, m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowUp, CalendarPlus, IdCard, Mic, Navigation, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentOrb } from "@/components/AgentCompanion";
import { CHAPTERS, Visual, card } from "@/components/Journey";
import { useLanguage, usePreferences } from "@/components/Preferences";

function useStill() {
  const { prefs } = usePreferences();
  const [still, setStill] = useState(false);
  useEffect(() => setStill(prefs.reducedMotion || prefs.textOnly || window.matchMedia("(prefers-reduced-motion: reduce)").matches), [prefs.reducedMotion, prefs.textOnly]);
  return still;
}

function Word({ word, i, n, progress }: { word: string; i: number; n: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [i / n, (i + 1) / n], [0.16, 1]);
  return <m.span style={{ opacity }}>{word} </m.span>;
}

// One sentence that lights up word by word as it scrolls through the viewport.
function Statement({ still }: { still: boolean }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.4"] });
  const text = t("A phone call should never stand between a Deaf resident and their appointment.", "لا ينبغي أن تقف مكالمة هاتفية بين المقيم الأصم وموعده.");
  const words = text.split(" ");
  return <section ref={ref} className="story-statement">
    <p>{still ? text : <><span className="sr-only">{text}</span><span aria-hidden>{words.map((w, i) => <Word key={i} word={w} i={i} n={words.length} progress={scrollYProgress} />)}</span></>}</p>
  </section>;
}

// The journey pinned in place: each stretch of scrolling flips to the next chapter.
function PinnedJourney({ still }: { still: boolean }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const last = useRef(0);
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);
  useMotionValueEvent(scrollYProgress, "change", v => {
    const next = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(v * CHAPTERS.length)));
    if (next !== last.current) { setDir(next > last.current ? 1 : -1); last.current = next; setStep(next); }
  });
  const list = <ol className="story-list">{CHAPTERS.map((c, i) => <li key={i}><h3>{t(c.title[0], c.title[1])}</h3><p>{t("Meanwhile, Ishara", "في الأثناء، إشارة")} {t(c.backstage[0], c.backstage[1])}</p>{still && <div className="story-stage small"><article className="deck-card"><Visual step={i} active t={t} /></article></div>}</li>)}</ol>;
  if (still) return <section id="how-it-works" className="story-journey still" aria-labelledby="story-title"><h2 id="story-title" className="story-heading">{t("How Ishara works for you", "كيف تعمل إشارة من أجلك")}</h2>{list}</section>;
  const chapter = CHAPTERS[step];
  return <section ref={ref} id="how-it-works" className="story-journey" style={{ height: `${CHAPTERS.length * 85 + 40}vh` }} aria-labelledby="story-title">
    <div className="sr-only">{list}</div>
    <div className="story-sticky" aria-hidden>
      <div className="story-copy">
        <h2 id="story-title" className="story-heading">{t("How Ishara works for you", "كيف تعمل إشارة من أجلك")}</h2>
        <div className="story-rail"><m.span style={{ scaleY: fill }} /></div>
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step} className="story-chapter" initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -24, filter: "blur(8px)" }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
            <h3>{t(chapter.title[0], chapter.title[1])}</h3>
            <p className="story-backstage"><AgentOrb state={chapter.orb} /><span><strong>{t("Meanwhile, Ishara", "في الأثناء، إشارة")}</strong> {t(chapter.backstage[0], chapter.backstage[1])}</span></p>
          </m.div>
        </AnimatePresence>
      </div>
      <div className="story-stage">
        <div className="deck">
          <AnimatePresence initial={false} custom={dir}>
            <m.article key={step} className="deck-card" custom={dir} variants={card} initial="enter" exit="exit" animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0 }} transition={{ type: "spring", stiffness: 150, damping: 20 }}>
              <Visual step={step} active t={t} />
            </m.article>
          </AnimatePresence>
        </div>
      </div>
    </div>
  </section>;
}

const reveal = { hidden: { opacity: 0, y: 40, scale: 0.97 }, shown: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.12, duration: 0.7, ease: [0.32, 0.72, 0, 1] as const } }) };

// What the resident has on the day, each tile rising into view.
function Ready({ still }: { still: boolean }) {
  const { t } = useLanguage();
  const tiles = [
    { key: "captions", Icon: Mic, title: t("Live captions at the desk", "ترجمة نصية مباشرة عند المكتب"), body: t("What staff say appears as large text. You reply by typing.", "يظهر كلام الموظفين نصاً كبيراً، وترد بالكتابة."), visual: <p className="tile-caption">{t("Do you have your Emirates ID?", "هل معك الهوية الإماراتية؟")}<span className="tile-cursor" /></p> },
    { key: "staff", Icon: IdCard, title: t("One tap tells reception", "نقرة واحدة تُعلم الاستقبال"), body: t("A full-screen card explains you are Deaf and your interpreter is coming.", "بطاقة بملء الشاشة توضّح أنك أصم وأن مترجمك قادم."), visual: <p className="tile-staff">{t("I am Deaf. My interpreter is on the way.", "أنا أصم. مترجمي في الطريق.")}</p> },
    { key: "plan", Icon: CalendarPlus, title: t("Calendar and directions", "التقويم والاتجاهات"), body: t("Add the visit to your calendar and open the route in one tap.", "أضف الزيارة إلى تقويمك وافتح الطريق بنقرة."), visual: <div className="tile-icons"><CalendarPlus size={28} /><Navigation size={28} /></div> },
    { key: "backup", Icon: RefreshCw, title: t("A backup is always ready", "بديل جاهز دائماً"), body: t("If your interpreter cancels, the backup is offered the visit at once.", "إذا اعتذر مترجمك، يُعرض الموعد على البديل فوراً."), visual: <div className="tile-swap"><span>MA</span><RefreshCw size={20} /><span className="on">OK</span></div> },
  ];
  return <section className="story-ready" aria-labelledby="ready-title">
    <h2 id="ready-title" className="story-heading">{t("Ready for the visit", "جاهز للزيارة")}</h2>
    <div className="ready-grid">
      {tiles.map(({ key, Icon, title, body, visual }, i) => <m.article key={key} className={`ready-tile tile-${key}`} custom={i} variants={reveal} initial={still ? false : "hidden"} whileInView="shown" viewport={{ once: true, amount: 0.35 }}>
        <div className="tile-visual" aria-hidden>{visual}</div>
        <h3><Icon size={18} aria-hidden />{title}</h3>
        <p>{body}</p>
      </m.article>)}
    </div>
  </section>;
}

function Closing() {
  const { t } = useLanguage();
  return <section className="story-closing">
    <h2>{t("Ready when you are.", "جاهزون متى شئت.")}</h2>
    <button type="button" className="btn primary big" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => document.getElementById("msg")?.focus({ preventScroll: true }), 450); }}><ArrowUp size={18} aria-hidden />{t("Paste your appointment", "ألصق رسالة موعدك")}</button>
  </section>;
}

export function Story() {
  const still = useStill();
  return <div className="story">
    <Statement still={still} />
    <PinnedJourney still={still} />
    <Ready still={still} />
    <Closing />
  </div>;
}
