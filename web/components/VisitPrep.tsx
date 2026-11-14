"use client";

import { CalendarPlus, Navigation, Plus, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { icsFor } from "@/lib/calendar";
import { areaName } from "@/lib/locale";
import type { Snapshot } from "@/lib/types";

// Questions stay on this device only, keyed by the private request token.
export function useVisitQuestions(token: string) {
  const key = `ishara.questions.${token}`;
  const [questions, setQuestions] = useState<string[]>([]);
  useEffect(() => { try { setQuestions(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { setQuestions([]); } }, [key]);
  const save = (next: string[]) => { setQuestions(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  return [questions, save] as const;
}

export function VisitPrep({ snap, questions, onQuestions }: { snap: Snapshot; questions: string[]; onQuestions: (next: string[]) => void }) {
  const { t, lang } = useLanguage();
  const [draft, setDraft] = useState("");
  const [shared, setShared] = useState<string | null>(null);
  const a = snap.appointment;
  const place = `${a.entity}, ${areaName(a.area, "en")}, Dubai`;

  function addToCalendar() {
    const who = snap.assigned && (snap.status === "confirmed" || snap.status === "completed") ? `Interpreter: ${snap.assigned.name}. ` : "";
    const ics = icsFor({ uid: snap.id, title: `${a.entity}: sign language interpreter`, start: a.starts_at, minutes: a.duration_min, location: place, description: `${who}Updates: ${location.href}` });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    link.download = "ishara-appointment.ics";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: t("My Ishara appointment", "موعدي في إشارة"), url: location.href }); return; }
      await navigator.clipboard.writeText(location.href);
      setShared(t("Link copied.", "تم نسخ الرابط."));
    } catch { /* the person closed the share sheet */ }
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (q && !questions.includes(q)) onQuestions([...questions, q].slice(-8));
    setDraft("");
  }

  return <section className="card visit-prep" aria-labelledby="prep-title">
    <h2 id="prep-title">{t("Prepare for your visit", "استعد لزيارتك")}</h2>
    <div className="prep-actions">
      <button type="button" className="prep-action" onClick={addToCalendar}><CalendarPlus size={22} aria-hidden /><span>{t("Add to calendar", "أضف إلى التقويم")}</span></button>
      <a className="prep-action" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`} target="_blank" rel="noopener noreferrer"><Navigation size={22} aria-hidden /><span>{t("Directions", "الاتجاهات")}<span className="sr-only"> ({t("opens in a new tab", "يفتح في علامة تبويب جديدة")})</span></span></a>
      <button type="button" className="prep-action" onClick={share}><Share2 size={22} aria-hidden /><span>{t("Share status", "شارك الحالة")}</span></button>
    </div>
    <p className="small muted" role="status">{shared ?? t("Anyone with your link can see this appointment. Share it only with people you trust.", "يمكن لأي شخص لديه الرابط رؤية هذا الموعد. شاركه مع من تثق بهم فقط.")}</p>
    <div className="prep-questions">
      <h3>{t("Questions for staff", "أسئلة للموظفين")}</h3>
      <p className="small muted">{t("Write them now. They appear as quick messages in Conversation.", "اكتبها الآن، وستظهر كرسائل سريعة في المحادثة.")}</p>
      {questions.length > 0 && <ul>{questions.map(q => <li key={q}><span dir="auto">{q}</span><button type="button" className="icon-btn" aria-label={t(`Remove: ${q}`, `إزالة: ${q}`)} onClick={() => onQuestions(questions.filter(x => x !== q))}><X size={16} aria-hidden /></button></li>)}</ul>}
      <form className="prep-add" onSubmit={add}>
        <label className="sr-only" htmlFor="prep-question">{t("New question", "سؤال جديد")}</label>
        <input id="prep-question" dir="auto" maxLength={140} autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} placeholder={t("e.g. How long will the test take?", "مثال: كم سيستغرق الفحص؟")} />
        <button className="btn" disabled={!draft.trim()} aria-label={t("Add question", "أضف السؤال")}><Plus size={18} aria-hidden /></button>
      </form>
    </div>
  </section>;
}
