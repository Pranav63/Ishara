"use client";

import { Activity, ArrowRight, Check, Hand, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityDrawer } from "@/components/ActivityDrawer";
import { Connection, OfflineBanner, ResetButton, useMapPadding } from "@/components/Chrome";
import { Header } from "@/components/Header";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveMap } from "@/components/LiveMap";
import { MotionRoot } from "@/components/Motion";
import { OfferDock } from "@/components/OfferDock";
import { OperatorAccess } from "@/components/OperatorAccess";
import { DisplaySettings, useLanguage } from "@/components/Preferences";
import { RequesterSheet } from "@/components/RequesterSheet";
import { IconButton } from "@/components/ui";
import { api, type OperatorSession } from "@/lib/api";
import { useLive, useNow } from "@/lib/live";

async function load() {
  const [snap, interpreters, metrics, config, places, escalations] = await Promise.all([api.latest(), api.interpreters(), api.metrics(), api.config(), api.places(), api.escalations()]);
  return { snap, interpreters, metrics, config, places, escalations };
}

export default function Console() {
  const { t } = useLanguage();
  const router = useRouter();
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [authRequired, setAuthRequired] = useState(true);
  const [serviceError, setServiceError] = useState(false);
  const [mode, setMode] = useState<"resident" | "coordinator">("resident");
  useEffect(() => {
    const check = () => Promise.all([api.session(), api.config()]).then(([value, config]) => { setSession(value); setAuthRequired(config.operator_auth_required); setServiceError(false); }).catch(() => setServiceError(true));
    check();
    const poll = setInterval(check, 15000);
    return () => clearInterval(poll);
  }, []);
  const coordinator = mode === "coordinator" && session?.authenticated === true;
  const { data, error, refresh } = useLive(load, { enabled: coordinator });
  const now = useNow(data?.snap?.now);
  const [drawer, setDrawer] = useState(false);
  const padding = useMapPadding(drawer);
  const snap = data?.snap ?? null;
  const events = snap?.events ?? [];
  const online = !serviceError && !error;

  return <MotionRoot><div className={`${coordinator ? "console-view" : "resident-home"}${drawer ? " drawer-open" : ""}`}>
    <Header status={coordinator ? snap?.status : undefined}>
      {coordinator && <Connection online={online} llm={data?.config.llm} />}
      <DisplaySettings />
      {session?.authenticated && <button className="btn small view-switch" onClick={() => setMode(coordinator ? "resident" : "coordinator")}>{coordinator ? t("Requester", "طالب الخدمة") : t("Coordinator", "المنسق")}</button>}
      <OperatorAccess session={session} authRequired={authRequired} onChange={(s) => { setSession(s); setServiceError(false); if (s.authenticated) setMode("coordinator"); }} />
      {coordinator && <><HowItWorks /><IconButton label={t("Agent activity", "نشاط الوكيل")} badge={events.length} pressed={drawer} onClick={() => setDrawer((d) => !d)}><Activity size={19} aria-hidden /></IconButton>{data?.config.demo && <><ResetButton onDone={refresh} /><Link className="btn small primary hide-sm" href="/stage"><Play size={15} aria-hidden />{t("Present", "عرض")}</Link></>}</>}
    </Header>
    <OfflineBanner online={online} />
    {coordinator ? <><main id="main" className="canvas"><LiveMap places={data?.places ?? {}} interpreters={data?.interpreters ?? []} snap={snap} now={now} padding={padding} /></main><RequesterSheet snap={snap} onCreated={() => refresh()} /><OfferDock snap={snap} interpreters={data?.interpreters ?? []} now={now} onDone={refresh} /><ActivityDrawer open={drawer} onClose={() => setDrawer(false)} events={events} metrics={data?.metrics} escalations={data?.escalations} onDone={refresh} /></> : <main id="main" className="resident-grid">
      <section className="resident-intro"><div className="service-label"><Hand size={18} aria-hidden />{t("For a more accessible Dubai", "من أجل دبي أكثر إتاحة للجميع")}</div><h1>{t("Your appointment.", "موعدك.")}<br /><span>{t("Support, on your terms.", "ودعمٌ يناسبك.")}</span></h1><p className="intro-description">{t("An interpreter for the moments that matter. Share your appointment, check the details, and follow every update in text.", "مترجم للمواعيد التي تهمك. شارك موعدك، وراجع التفاصيل، وتابع كل تحديث بالنص.")}</p><ol className="resident-steps">{[["Share your appointment", "شارك موعدك", "Paste a message from your hospital, school or service centre.", "ألصق رسالة المستشفى أو المدرسة أو مركز الخدمة."], ["Check every detail", "راجع كل التفاصيل", "Choose your sign language and approve the date and place.", "اختر لغة الإشارة وأكد التاريخ والمكان."], ["Stay in the loop", "تابع المستجدات", "See your interpreter and the arrival time they share.", "اطلع على مترجمك ووقت الوصول الذي يشاركه."]].map(([en, ar, detailEn, detailAr], i) => <li key={en}><span>{i + 1}</span><div><strong>{t(en, ar)}</strong><p>{t(detailEn, detailAr)}</p></div></li>)}</ol><div className="resident-assurance"><Check size={18} aria-hidden />{t("Text updates. No phone call required.", "تحديثات نصية. دون الحاجة إلى مكالمة هاتفية.")}</div><p className="small muted">{t("Ishara is a service prototype. Interpreter availability is confirmed only when someone accepts.", "إشارة نموذج أولي للخدمة. لا يتأكد توفر المترجم إلا بعد قبوله الطلب.")}</p><a className="text-link" href="#request-panel">{t("Start a request", "ابدأ طلبك")}<ArrowRight size={17} aria-hidden /></a></section>
      <div id="request-panel" className="resident-request"><RequesterSheet snap={null} onCreated={(created) => { if (created) router.push(`/r/${created.token}`); }} /></div>
      <footer className="resident-footer"><span translate="no">Ishara · إشارة</span><span>{t("Built around choice, dignity and access.", "صُممت حول الاختيار والكرامة وإمكانية الوصول.")}</span></footer>
    </main>}
  </div></MotionRoot>;
}
