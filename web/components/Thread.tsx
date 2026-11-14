"use client";

import { Fragment, useEffect, useRef } from "react";
import { AgentTimeline } from "@/components/AgentTimeline";
import { useLanguage, usePreferences } from "@/components/Preferences";
import type { Snapshot } from "@/lib/types";

function Redacted({ text }: { text: string }) {
  const { t } = useLanguage();
  return <>{text.split(/(\[[A-Z_]+\])/g).map((part, i) => /^\[[A-Z_]+\]$/.test(part) ? <span key={i} className="redacted">{t("private detail hidden", "تم حجب بيانات خاصة")}</span> : <Fragment key={i}>{part}</Fragment>)}</>;
}

// Coordinator and presentation view: the resident's message, then every step the agent took.
export function Thread({ snap }: { snap: Snapshot | null }) {
  const { t } = useLanguage();
  const { prefs } = usePreferences();
  const ref = useRef<HTMLDivElement>(null);
  const count = snap?.events?.length ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefs.reducedMotion || prefs.textOnly || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [count, snap?.id, prefs.reducedMotion, prefs.textOnly]);
  if (!snap) return null;
  return <div className="thread" ref={ref} aria-label={t("Request conversation", "محادثة الطلب")}>
    <span className="meta">{t("Request", "طلب")} <bdi>{snap.id}</bdi></span>
    <div className="bubble them" dir="auto"><Redacted text={snap.message} /></div>
    <AgentTimeline items={(snap.events ?? []).map(e => ({ id: e.id, ts: e.ts, kind: e.kind, text: e.payload.text }))} status={snap.status} waitingForCoordinator={snap.status === "escalated" && snap.escalation?.status !== "acknowledged"} detailed heading="h3" />
  </div>;
}
