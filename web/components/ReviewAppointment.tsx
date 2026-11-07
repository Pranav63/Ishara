"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AgentCompanion } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { areaName } from "@/lib/locale";
import { dubaiEpoch, dubaiInputValue } from "@/lib/review";
import type { Snapshot } from "@/lib/types";

export function ReviewAppointment({ snap, onDone, primary = false }: { snap: Snapshot; onDone: () => void; primary?: boolean }) {
  const { t, lang } = useLanguage();
  const id = useId();
  const Heading = primary ? "h1" : "h2";
  const [places, setPlaces] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entity, setEntity] = useState(snap.appointment.entity);
  const [area, setArea] = useState(snap.appointment.area);
  const [starts, setStarts] = useState(dubaiInputValue(snap.appointment.starts_at));
  const [duration, setDuration] = useState(snap.appointment.duration_min);
  const [domain, setDomain] = useState(snap.appointment.domain);
  const [language, setLanguage] = useState(snap.appointment.language);
  useEffect(() => { api.places().then((p) => setPlaces(Object.keys(p))).catch(() => setError(t("Could not load supported areas. Try reloading.", "تعذر تحميل المناطق المتاحة. أعد تحميل الصفحة."))); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.approve(snap.token, { entity, area, starts_at: dubaiEpoch(starts), duration_min: duration, domain, language });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="appointment-review" onSubmit={submit} aria-labelledby={`${id}-heading`}>
    <div className="review-heading"><div><Heading id={`${id}-heading`}>{t("Review your appointment", "راجع موعدك")}</Heading><p className="small muted">{t("Check the details before we look for an interpreter. Times are in Dubai time (UTC+4).", "راجع التفاصيل قبل البحث عن مترجم. الأوقات بتوقيت دبي (UTC+4).")}</p></div>{primary && <AgentCompanion status="reviewing" compact />}</div>
    {snap.appointment.assumed.length > 0 && <p className="review-note">{t("Some details were inferred. Please check every field below.", "تم استنتاج بعض التفاصيل. يرجى مراجعة جميع الحقول أدناه.")}</p>}
    <label htmlFor={`${id}-venue`}>{t("Appointment location", "مكان الموعد")}<input id={`${id}-venue`} value={entity} onChange={(e) => setEntity(e.target.value)} required minLength={2} maxLength={120} /></label>
    <div className="review-pair"><label htmlFor={`${id}-area`}>{t("Dubai area", "المنطقة في دبي")}<select id={`${id}-area`} value={area} onChange={(e) => setArea(e.target.value)} required><option value="" disabled>{t("Choose an area", "اختر المنطقة")}</option>{places.map((p) => <option key={p} value={p}>{areaName(p, lang)}</option>)}</select></label>
    <label htmlFor={`${id}-when`}>{t("Date & time · Dubai", "التاريخ والوقت · دبي")}<input dir="ltr" id={`${id}-when`} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required /></label></div>
    <div className="review-pair"><label htmlFor={`${id}-duration`}>{t("Duration (minutes)", "المدة (دقيقة)")}<input id={`${id}-duration`} type="number" min={5} max={480} required value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label><label htmlFor={`${id}-type`}>{t("Visit type", "نوع الزيارة")}<select id={`${id}-type`} value={domain} onChange={(e) => setDomain(e.target.value)}>{[["medical", "Medical", "طبي"], ["legal", "Legal", "قانوني"], ["government", "Government", "حكومي"], ["education", "Education", "تعليمي"], ["other", "Other", "أخرى"]].map(([v, en, ar]) => <option key={v} value={v}>{t(en, ar)}</option>)}</select></label></div>
    <label htmlFor={`${id}-language`}>{t("Sign language", "لغة الإشارة")}<select id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value)}>{[["UAE Sign Language", "Emirati Sign Language", "لغة الإشارة الإماراتية"], ["ASL", "American Sign Language (ASL)", "لغة الإشارة الأمريكية (ASL)"], ["International Sign", "International Sign", "الإشارة الدولية"]].map(([v, en, ar]) => <option key={v} value={v}>{t(en, ar)}</option>)}</select></label>
    <p className="privacy"><ShieldCheck size={16} aria-hidden />{t("Your confirmation starts the interpreter search.", "تبدأ عملية البحث عن مترجم بعد تأكيدك.")}</p>
    <button type="submit" className="btn primary big" disabled={busy || places.length === 0}><Check size={18} aria-hidden />{busy ? t("Confirming…", "جارٍ التأكيد…") : t("Confirm request", "تأكيد الطلب")}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
