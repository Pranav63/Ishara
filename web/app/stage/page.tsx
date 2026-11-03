"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OfflineBanner, useMapPadding } from "@/components/Chrome";
import { Header } from "@/components/Header";
import { LiveMap } from "@/components/LiveMap";
import { MotionRoot } from "@/components/Motion";
import { OfferDock } from "@/components/OfferDock";
import { DisplaySettings, useLanguage } from "@/components/Preferences";
import { RequesterSheet } from "@/components/RequesterSheet";
import { api } from "@/lib/api";
import { SAMPLES } from "@/lib/format";
import { useLive, useNow } from "@/lib/live";
import type { Snapshot } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STORY = [
  ["Press Play to run a scripted service demonstration.", "اضغط تشغيل لعرض سيناريو تجريبي للخدمة."],
  ["Layla receives her hospital appointment as a text message.", "تتلقى ليلى موعد المستشفى برسالة نصية."],
  ["She reviews the appointment, then confirms the interpreter search.", "تراجع ليلى تفاصيل الموعد ثم تؤكد البحث عن مترجم."],
  ["An interpreter accepts. The appointment is confirmed, and a backup is held.", "يقبل مترجم الطلب. يتأكد الموعد ويُحجز مترجم احتياطي."],
  ["Then the interpreter cancels.", "ثم يعتذر المترجم عن الحضور."],
  ["Ishara checks a replacement, without a phone call from Layla.", "تبحث إشارة عن بديل دون حاجة ليلى إلى مكالمة هاتفية."],
  ["Same appointment. A new interpreter is confirmed.", "الموعد نفسه. تم تأكيد مترجم جديد."],
  ["After the visit, Layla receives a written summary.", "بعد الزيارة، تتلقى ليلى ملخصاً مكتوباً."],
  ["Every change is visible in text, with support when plans change.", "كل تغيير ظاهر بالنص، مع دعم عند تغير الخطط."],
];
async function load() {
  const [session, config] = await Promise.all([api.session(), api.config()]);
  if (!session.authenticated || !config.demo) return { allowed: false, snap: null, interpreters: [], places: {} };
  const [snap, interpreters, places] = await Promise.all([api.latest(), api.interpreters(), api.places()]);
  return { allowed: true, snap, interpreters, places };
}

export default function Stage() {
  const { t, isAr } = useLanguage();
  const { data, error, refresh } = useLive(load, { stream: false });
  const now = useNow(data?.snap?.now);
  const padding = useMapPadding(false, true);
  const [step, setStep] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);
  const interpreters = data?.interpreters ?? [];
  async function play() {
    if (!data?.allowed) return;
    const id = ++run.current;
    const alive = () => run.current === id;
    const tok = (iid: string) => interpreters.find((i) => i.id === iid)?.token ?? "";
    const latest = async () => (await api.latest()) as Snapshot;
    setRunning(true); setFailure(null);
    try {
      await api.reset(); await refresh(); setStep(1); await sleep(1600); if (!alive()) return;
      const created = await api.create(SAMPLES[0].text, "Layla");
      let s = created;
      for (let i = 0; i < 30 && s.status === "parsing" && alive(); i++) { await sleep(200); s = await api.requester(created.token); }
      if (!alive()) return;
      if (s.status !== "reviewing") throw new Error(t("The appointment is not ready for review.", "الموعد غير جاهز للمراجعة."));
      setStep(2); await refresh(); await sleep(2000); if (!alive()) return;
      const { entity, area, starts_at, duration_min, domain, language } = s.appointment;
      await api.approve(s.token, { entity, area, starts_at, duration_min, domain, language });
      await sleep(1000); if (!alive()) return;
      s = await latest(); const first = s.offers?.find((o) => o.status === "pending");
      if (!first) throw new Error(t("No pending interpreter offer is available.", "لا يوجد عرض مترجم معلق."));
      await api.accept(tok(first.interpreter_id), first.id);
      s = await latest();
      if (s.status !== "confirmed") throw new Error(t("The interpreter has not been confirmed.", "لم يتم تأكيد المترجم."));
      setStep(3); await refresh(); await sleep(3000); if (!alive()) return;
      setStep(4); await sleep(1600); if (!alive()) return;
      s = await latest(); if (s.assigned) await api.cancel(tok(s.assigned.id), s.id);
      setStep(5); await refresh(); await sleep(2200); if (!alive()) return;
      s = await latest(); const next = s.offers?.find((o) => o.status === "pending");
      if (next) await api.accept(tok(next.interpreter_id), next.id);
      s = await latest();
      if (s.status !== "confirmed") throw new Error(t("A replacement is not confirmed yet.", "لم يُؤكد المترجم البديل بعد."));
      setStep(6); await refresh(); await sleep(2500); if (!alive()) return;
      s = await latest(); if (s.assigned) await api.complete(tok(s.assigned.id), s.id, "Blood test done. Return in two weeks.");
      setStep(7); await refresh(); await sleep(2500); if (alive()) setStep(8);
    } catch (e) { if (alive()) setFailure((e as Error).message); } finally { if (alive()) setRunning(false); }
  }
  if (data && !data.allowed) return <main id="main" className="phone"><section className="card"><h1>{t("Demo presentation", "العرض التجريبي")}</h1><p>{t("This presentation is available only in an authenticated demo workspace.", "هذا العرض متاح فقط في مساحة تجريبية بعد تسجيل الدخول.")}</p><Link className="btn primary" href="/">{t("Return to Ishara", "العودة إلى إشارة")}</Link></section></main>;
  return <MotionRoot><Header status={data?.snap?.status}><DisplaySettings /><Link className="btn small" href="/"><ArrowLeft size={16} aria-hidden />{t("Home", "الرئيسية")}</Link><button className="btn small primary" disabled={!data?.allowed} onClick={play}>{running ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}{running ? t("Restart", "إعادة تشغيل") : t("Play", "تشغيل")}</button></Header><OfflineBanner online={!error} /><main id="main" className="canvas"><LiveMap places={data?.places ?? {}} interpreters={interpreters} snap={data?.snap ?? null} now={now} padding={padding} /></main><RequesterSheet snap={data?.snap ?? null} onCreated={() => refresh()} composer={false} /><div className="stage-dock"><OfferDock snap={data?.snap ?? null} interpreters={interpreters} now={now} onDone={refresh} interactive={false} /></div><div className="caption-dock" role="status"><AnimatePresence mode="wait"><m.p key={`${step}-${failure}`} className="caption glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{failure ?? STORY[step][isAr ? 1 : 0]}</m.p></AnimatePresence></div></MotionRoot>;
}
