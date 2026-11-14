"use client";

import { Bell, CalendarClock, ClipboardList, Hand, MapPin, Navigation, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentOrb } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { areaName, languageName } from "@/lib/locale";
import type { Appointment } from "@/lib/types";

type Reading = Appointment & { hidden: number };
const DOMAINS: Record<string, [string, string]> = { medical: ["Medical", "طبي"], legal: ["Legal", "قانوني"], government: ["Government", "حكومي"], education: ["Education", "تعليمي"], other: ["Other", "أخرى"] };

// Live read-back of the draft: the agent shows what it understood before anything is sent or stored.
export function HomePreview({ text, online }: { text: string; online: boolean }) {
  const { t, lang } = useLanguage();
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

  const r = draft.length >= 8 ? reading : null;
  const when = r && new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(r.starts_at * 1000);
  const check = (...keys: string[]) => !!r && keys.some(k => r.assumed.includes(k));
  const domain = r ? DOMAINS[r.domain] ?? DOMAINS.other : null;
  const rows = [
    { key: "place", Icon: MapPin, label: t("Place", "المكان"), value: r?.entity, guess: check("venue") },
    { key: "area", Icon: Navigation, label: t("Area", "المنطقة"), value: r ? areaName(r.area, lang) : null, guess: check("location") },
    { key: "when", Icon: CalendarClock, label: t("Date and time", "التاريخ والوقت"), value: when, guess: check("date", "time") },
    { key: "type", Icon: ClipboardList, label: t("Visit type", "نوع الزيارة"), value: domain ? t(domain[0], domain[1]) : null, guess: false },
    { key: "language", Icon: Hand, label: t("Sign language", "لغة الإشارة"), value: r ? languageName(r.language, lang) : null, guess: false },
    { key: "privacy", Icon: ShieldCheck, label: t("Private details", "البيانات الخاصة"), value: r ? (r.hidden ? t(`${r.hidden} hidden before storage`, `حُجب ${r.hidden} قبل التخزين`) : t("None found", "لا يوجد")) : null, guess: false },
  ];

  return <figure className="home-visual" aria-labelledby="reading-title">
    <div className="reading-head">
      <AgentOrb state={busy ? "parsing" : r ? "reviewing" : "idle"} />
      <div>
        <h2 id="reading-title">{r ? t("Here’s what Ishara understood", "هذا ما فهمته إشارة") : t("Ishara reads it as you type", "تقرأ إشارة رسالتك أثناء الكتابة")}</h2>
        <p>{r ? t("You can correct anything on the next step.", "يمكنك تصحيح أي شيء في الخطوة التالية.") : t("Paste your message or try an example.", "ألصق رسالتك أو جرّب مثالاً.")}</p>
      </div>
    </div>
    <dl className="reading" aria-live="polite" aria-busy={busy}>
      {rows.map(({ key, Icon, label, value, guess }) => <div key={key} className={value ? "filled" : undefined}>
        <dt><Icon size={17} aria-hidden />{label}</dt>
        <dd>{value ? <span key={value} className="reading-value" dir="auto">{value}</span> : <span className="reading-empty" role="img" aria-label={t("Waiting", "بانتظار")} />}{guess && <span className="inferred">{t("Check", "تحقق")}</span>}</dd>
      </div>)}
    </dl>
    <ol className="reading-next" aria-label={t("Then Ishara", "ثم تقوم إشارة")}>
      <li><Users size={16} aria-hidden />{t("Finds a certified interpreter", "تجد مترجماً معتمداً")}</li>
      <li><RefreshCw size={16} aria-hidden />{t("Keeps a backup ready", "تجهز بديلاً")}</li>
      <li><Bell size={16} aria-hidden />{t("Updates you in text", "تُعلمك بالنص")}</li>
    </ol>
  </figure>;
}
