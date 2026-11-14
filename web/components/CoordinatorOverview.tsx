"use client";

import { m } from "motion/react";
import { Activity, BadgeCheck, Gauge, MapPin, Plus, Route, Sparkles, Timer } from "lucide-react";
import { AgentOrb } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { areaName } from "@/lib/locale";
import { initials } from "@/lib/format";
import type { Interp, Metrics } from "@/lib/types";

// What the AI coordinator shows when no request is open: its state, its roster and how it decides.
export function CoordinatorOverview({ interpreters, metrics, onNew, onActivity }: { interpreters: Interp[]; metrics?: Metrics; onNew: () => void; onActivity: () => void }) {
  const { t, lang } = useLanguage();
  const roster = [...interpreters].sort((a, b) => b.reliability - a.reliability);
  const certified = interpreters.filter(i => i.certified).length;
  const avg = interpreters.length ? Math.round(interpreters.reduce((n, i) => n + i.reliability, 0) / interpreters.length * 100) : 0;
  const stats = [
    { Icon: BadgeCheck, value: `${certified}/${interpreters.length}`, label: t("Certified on call", "معتمدون متاحون") },
    { Icon: Gauge, value: `${avg}%`, label: t("Average reliability", "متوسط الموثوقية") },
    { Icon: Sparkles, value: metrics ? `${metrics.filled}/${metrics.requests}` : "–", label: t("Requests filled", "طلبات مكتملة") },
    { Icon: Timer, value: metrics?.median_confirm_s != null ? `${Math.round(metrics.median_confirm_s)}s` : "–", label: t("Median time to confirm", "متوسط زمن التأكيد") },
  ];
  const factors = [[Route, t("Distance", "المسافة")], [BadgeCheck, t("Certification", "الاعتماد")], [Sparkles, t("Visit experience", "الخبرة")], [Gauge, t("Reliability", "الموثوقية")]] as const;

  return <m.section className="sheet glass strong coord-overview" aria-labelledby="coord-title" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
    <header className="coord-head">
      <AgentOrb state="dispatching" />
      <div>
        <p className="section-kicker"><span className="live-dot" aria-hidden />{t("Watching for requests", "يراقب الطلبات")}</p>
        <h2 id="coord-title">{t("Ishara coordinator", "منسق إشارة")}</h2>
      </div>
    </header>
    <p className="coord-lede">{t("Each new request is read, matched and offered to interpreters automatically. You step in only when the agent asks.", "يُقرأ كل طلب جديد ويُطابق ويُعرض على المترجمين تلقائياً. تتدخل فقط عندما يطلب الوكيل ذلك.")}</p>
    <div className="coord-body">
      <dl className="coord-stats">
        {stats.map(({ Icon, value, label }) => <div key={label}><dt><Icon size={14} aria-hidden />{label}</dt><dd className="num">{value}</dd></div>)}
      </dl>
      <section aria-labelledby="coord-factors">
        <h3 id="coord-factors">{t("How it ranks interpreters", "كيف يرتب المترجمين")}</h3>
        <ul className="coord-factors">{factors.map(([Icon, label]) => <li key={label}><Icon size={14} aria-hidden />{label}</li>)}</ul>
      </section>
      <section aria-labelledby="coord-roster">
        <h3 id="coord-roster">{t("Interpreters on the map", "المترجمون على الخريطة")} <span className="num">{interpreters.length}</span></h3>
        <ul className="coord-roster">
          {roster.map((i, n) => <m.li key={i.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.1 + n * 0.04 } }}>
            <span className={`avatar${i.certified ? " ok" : ""}`} aria-hidden>{initials(i.name)}</span>
            <span className="coord-who"><strong>{i.name}</strong><small><MapPin size={12} aria-hidden />{areaName(i.area, lang)}{i.certified && ` · ${t("Certified", "معتمد")}`}</small></span>
            <span className="coord-rel" aria-label={t(`${Math.round(i.reliability * 100)}% reliable`, `موثوقية ${Math.round(i.reliability * 100)}%`)}><span className="coord-track"><span style={{ transform: `scaleX(${i.reliability})` }} /></span><small className="num" aria-hidden>{Math.round(i.reliability * 100)}%</small></span>
          </m.li>)}
        </ul>
      </section>
    </div>
    <div className="coord-actions">
      <button type="button" className="btn" onClick={onActivity}><Activity size={16} aria-hidden />{t("Activity log", "سجل النشاط")}</button>
      <button type="button" className="btn primary" onClick={onNew}><Plus size={16} aria-hidden />{t("New request", "طلب جديد")}</button>
    </div>
  </m.section>;
}
