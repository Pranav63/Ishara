"use client";

import { AnimatePresence, m } from "motion/react";
import { Fragment, useEffect, useRef } from "react";
import { useLanguage, usePreferences } from "@/components/Preferences";
import type { Snapshot } from "@/lib/types";

type Bubble = { id: string; from: "them" | "us"; text: string; warn?: boolean; lang?: string };

function build(s: Snapshot, ar: boolean): Bubble[] {
  const out: Bubble[] = [{ id: "msg", from: "them", text: s.message }];
  const live = s.status === "confirmed" || s.status === "completed";
  for (const event of s.events ?? []) {
    const text = event.kind === "parsed" ? (ar ? "قرأت موعدك. يرجى مراجعة التفاصيل وتأكيدها قبل البحث عن مترجم." : "I’ve read your appointment. Please review and confirm the details before we match.")
      : event.kind === "interpreter_cancelled" ? (ar ? "اعتذر مترجمك. يجري البحث عن بديل. لم يتغير وقت موعدك." : "Your interpreter can no longer attend. A replacement is being arranged. Your appointment time has not changed.")
      : event.kind === "no_match" ? (ar ? "لم يتأكد توفر مترجم مؤهل. أُضيف طلبك إلى قائمة انتظار المنسق، ويمكنك تجربة الدعم عن بُعد." : "No qualified interpreter is confirmed. Your request is in the coordinator queue, and you can try remote support.") : null;
    if (text) out.push({ id: `e${event.id}`, from: "us", text, warn: ["no_match", "interpreter_cancelled"].includes(event.kind) });
  }
  if (live && s.confirmation) out.push({ id: "confirmation", from: "us", text: ar ? s.confirmation.ar ?? s.confirmation.en : s.confirmation.en, lang: ar && s.confirmation.ar ? "ar" : "en" });
  if (s.status === "completed" && s.summary) out.push({ id: "summary", from: "us", text: ar ? s.summary.ar ?? s.summary.en : s.summary.en, lang: ar && s.summary.ar ? "ar" : "en" });
  return out;
}

function Redacted({ text }: { text: string }) {
  const { t } = useLanguage();
  return <>{text.split(/(\[[A-Z_]+\])/g).map((part, i) => /^\[[A-Z_]+\]$/.test(part) ? <span key={i} className="redacted">{t("private detail hidden", "تم حجب بيانات خاصة")}</span> : <Fragment key={i}>{part}</Fragment>)}</>;
}

export function Thread({ snap }: { snap: Snapshot | null }) {
  const { isAr, t } = useLanguage();
  const { prefs } = usePreferences();
  const ref = useRef<HTMLDivElement>(null);
  const bubbles = snap ? build(snap, isAr) : [];
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefs.reducedMotion || prefs.textOnly || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [bubbles.length, snap?.id, prefs.reducedMotion, prefs.textOnly]);
  if (!snap) return null;
  return <div className="thread" ref={ref} aria-label={t("Request conversation", "محادثة الطلب")}><span className="meta">{t("Request", "طلب")} <bdi>{snap.id}</bdi></span><AnimatePresence initial={false}>{bubbles.map((bubble) => <m.div key={bubble.id} lang={bubble.lang} dir="auto" className={`bubble ${bubble.from}${bubble.warn ? " warn" : ""}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{bubble.from === "them" ? <Redacted text={bubble.text} /> : bubble.text}</m.div>)}</AnimatePresence></div>;
}
