"use client";

import { FlipVertical2, Mic, MicOff, Send, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { readResults, type SpeechResults } from "@/lib/captions";

// Minimal shape of the browser's speech recognizer (Chrome and Safari expose it with a webkit prefix).
type Recognizer = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: SpeechResults }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Line = { id: number; who: "staff" | "me"; text: string; lang?: string };

const recognizerClass = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

// Shown to staff in the language they speak, whatever language the resident reads.
const PHRASES = [
  ["Deaf", "أصم", "I am Deaf. Please type or write for me.", "أنا أصم. يرجى الكتابة لي."],
  ["Speak clearly", "تحدث بوضوح", "Please speak clearly, one person at a time.", "يرجى التحدث بوضوح، شخص واحد في كل مرة."],
  ["Repeat", "الإعادة", "Could you repeat that, please?", "هل يمكنك الإعادة من فضلك؟"],
  ["Interpreter", "المترجم", "My sign language interpreter is on the way.", "مترجم لغة الإشارة في الطريق إليّ."],
];

export function TextBridge({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const rec = useRef<Recognizer | null>(null);
  const wanted = useRef(false);
  const nextId = useRef(0);
  const [supported] = useState(() => recognizerClass() !== null);
  const [staffLang, setStaffLang] = useState<"en-US" | "ar-AE">(lang === "ar" ? "ar-AE" : "en-US");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [staffDraft, setStaffDraft] = useState("");
  const [speak, setSpeak] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staffIsArabic = staffLang === "ar-AE";
  const lastMine = [...lines].reverse().find(l => l.who === "me");

  useEffect(() => { dialog.current?.showModal(); return () => { wanted.current = false; rec.current?.abort(); window.speechSynthesis?.cancel(); }; }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [lines.length, interim]);

  const add = (who: Line["who"], text: string, textLang?: string) => setLines(current => [...current, { id: nextId.current++, who, text, lang: textLang }]);

  function startListening(speechLang: string = staffLang) {
    const Recognition = recognizerClass();
    if (!Recognition) return;
    setError(null);
    const r = new Recognition();
    r.lang = speechLang; r.continuous = true; r.interimResults = true;
    r.onresult = e => {
      const { final, interim } = readResults(e.results, e.resultIndex);
      final.forEach(text => add("staff", text, speechLang));
      setInterim(interim);
    };
    r.onerror = e => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? t("Microphone access is blocked. Allow it in your browser settings, or ask staff to type below.", "تم حظر الميكروفون. اسمح به من إعدادات المتصفح، أو اطلب من الموظفين الكتابة أدناه.")
        : t("Captions stopped. Try again, or ask staff to type below.", "توقفت الترجمة النصية. حاول مجدداً أو اطلب من الموظفين الكتابة أدناه."));
    };
    // Browsers end recognition after a pause; keep captioning until the resident stops it.
    r.onend = () => { if (rec.current !== r) return; setInterim(""); if (wanted.current) { try { r.start(); } catch { wanted.current = false; setListening(false); } } else setListening(false); };
    rec.current = r; wanted.current = true;
    try { r.start(); setListening(true); } catch { wanted.current = false; }
  }
  function stopListening() { wanted.current = false; rec.current?.stop(); setListening(false); setInterim(""); }
  function changeStaffLang(value: "en-US" | "ar-AE") { const was = listening; stopListening(); setStaffLang(value); if (was) startListening(value); }

  function reply(text: string, textLang?: string) {
    const clean = text.trim();
    if (!clean) return;
    add("me", clean, textLang);
    setFlipped(false);
    if (speak && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = textLang ?? staffLang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }

  return <dialog ref={dialog} className="bridge" aria-labelledby="bridge-title" onClose={onClose}>
    <header className="bridge-top">
      <div><h2 id="bridge-title">{t("Conversation", "محادثة")}</h2><p className="small muted">{t("Ishara does not save this conversation.", "لا تحفظ إشارة هذه المحادثة.")}</p></div>
      <label className="bridge-lang"><span>{t("Staff speak", "لغة الموظفين")}</span><select value={staffLang} onChange={e => changeStaffLang(e.target.value as "en-US" | "ar-AE")}><option value="en-US">English</option><option value="ar-AE">العربية</option></select></label>
      <button type="button" autoFocus className="icon-btn bridge-close" aria-label={t("Close conversation", "إغلاق المحادثة")} onClick={() => dialog.current?.close()}><X size={22} aria-hidden /></button>
    </header>

    <ol ref={list} className="bridge-lines" aria-live="polite" aria-label={t("Conversation so far", "المحادثة حتى الآن")}>
      {lines.length === 0 && !interim && <li className="bridge-empty">{supported ? t("Turn on captions, then place the phone between you and the staff member.", "شغّل الترجمة النصية، ثم ضع الهاتف بينك وبين الموظف.") : t("Live captions are not available in this browser. Staff can type in the box below.", "الترجمة النصية المباشرة غير متاحة في هذا المتصفح. يمكن للموظفين الكتابة في المربع أدناه.")}</li>}
      {lines.map(line => <li key={line.id} className={`bridge-line from-${line.who}`}><span className="bridge-who">{line.who === "staff" ? t("Staff", "الموظف") : t("You", "أنت")}</span><span dir="auto" lang={line.lang?.slice(0, 2)}>{line.text}</span></li>)}
      {interim && <li className="bridge-line from-staff interim" aria-hidden><span dir="auto">{interim}</span></li>}
    </ol>

    {lastMine && <section className={`bridge-show${flipped ? " flipped" : ""}`} aria-label={t("Your latest message", "آخر رسالة منك")}>
      <p dir="auto" lang={lastMine.lang?.slice(0, 2)}>{lastMine.text}</p>
      <button type="button" className="btn small" aria-pressed={flipped} onClick={() => setFlipped(v => !v)}><FlipVertical2 size={16} aria-hidden />{t("Turn to staff", "اقلب للموظف")}</button>
    </section>}

    <div className="bridge-controls">
      {error && <p className="error" role="alert">{error}</p>}
      {!supported && <form className="bridge-compose" onSubmit={e => { e.preventDefault(); if (staffDraft.trim()) { add("staff", staffDraft.trim(), staffLang); setStaffDraft(""); } }}>
        <label className="sr-only" htmlFor="bridge-staff">{t("Staff message", "رسالة الموظف")}</label>
        <input id="bridge-staff" dir="auto" autoComplete="off" value={staffDraft} onChange={e => setStaffDraft(e.target.value)} placeholder={t("Staff: type here", "الموظف: اكتب هنا")} />
        <button className="btn" disabled={!staffDraft.trim()}>{t("Add", "إضافة")}</button>
      </form>}
      <div className="bridge-phrases" role="group" aria-label={t("Quick messages", "رسائل سريعة")}>
        {PHRASES.map(([en, ar, sayEn, sayAr]) => <button type="button" key={en} className="sample" onClick={() => reply(staffIsArabic ? sayAr : sayEn, staffLang)}>{t(en, ar)}</button>)}
      </div>
      <form className="bridge-compose" onSubmit={e => { e.preventDefault(); reply(draft); setDraft(""); }}>
        <label className="sr-only" htmlFor="bridge-reply">{t("Your reply", "ردك")}</label>
        <input id="bridge-reply" dir="auto" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} placeholder={t("Type your reply", "اكتب ردك")} />
        <button className="btn primary" disabled={!draft.trim()} aria-label={t("Send", "إرسال")}><Send size={18} aria-hidden /></button>
      </form>
      <div className="bridge-actions">
        {supported && <button type="button" className={`btn ${listening ? "danger" : "primary"}`} aria-pressed={listening} onClick={() => listening ? stopListening() : startListening()}>{listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}{listening ? t("Stop captions", "إيقاف الترجمة النصية") : t("Start captions", "بدء الترجمة النصية")}</button>}
        <label className="setting-check bridge-speak"><input type="checkbox" checked={speak} onChange={e => setSpeak(e.target.checked)} /><span><Volume2 size={16} aria-hidden /> {t("Read my replies aloud", "اقرأ ردودي بصوت عالٍ")}</span></label>
      </div>
      {listening && <p className="bridge-status" role="status"><i aria-hidden />{t("Listening. Captions appear above.", "أستمع. تظهر الترجمة النصية أعلاه.")}</p>}
    </div>
  </dialog>;
}
