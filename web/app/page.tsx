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
import type { Snapshot } from "@/lib/types";

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
  const [compose, setCompose] = useState(false);
  const [created, setCreated] = useState<Snapshot | null>(null);
  useEffect(() => {
    const check = () => Promise.all([api.session(), api.config()]).then(([value, config]) => { setSession(value); setAuthRequired(config.operator_auth_required); setServiceError(false); }).catch(() => setServiceError(true));
    check();
    const poll = setInterval(check, 15000);
    return () => clearInterval(poll);
  }, []);
  const coordinator = mode === "coordinator" && session?.authenticated === true;
  const { data, error, refresh } = useLive(load, { enabled: coordinator });
  useEffect(() => { if (!coordinator) { setCompose(false); setCreated(null); } }, [coordinator]);
  useEffect(() => { if (created && data?.snap?.id === created.id) setCreated(null); }, [created, data?.snap]);
  const [drawer, setDrawer] = useState(false);
  const padding = useMapPadding(drawer);
  const snap = created ?? data?.snap ?? null;
  const activeSnap = compose ? null : snap;
  const now = useNow(snap?.now);
  const events = activeSnap?.events ?? [];
  const online = !serviceError && !error;

  return <MotionRoot><div className={`${coordinator ? "console-view" : "resident-home"}${drawer ? " drawer-open" : ""}`}>
    <Header status={coordinator ? activeSnap?.status : undefined} connection={coordinator ? <Connection online={online} llm={data?.config.llm} /> : undefined}>
      <DisplaySettings />
      {session?.authenticated && <button className="btn small view-switch" onClick={() => setMode(coordinator ? "resident" : "coordinator")}>{coordinator ? t("Requester", "طالب الخدمة") : t("Coordinator", "المنسق")}</button>}
      <OperatorAccess session={session} authRequired={authRequired} onChange={(s) => { setSession(s); setServiceError(false); if (s.authenticated) setMode("coordinator"); }} />
      {coordinator && <><HowItWorks /><IconButton label={t("Agent activity", "نشاط الوكيل")} badge={events.length} pressed={drawer} onClick={() => setDrawer((d) => !d)}><Activity size={19} aria-hidden /></IconButton>{data?.config.demo && <><ResetButton onDone={() => { setCreated(null); setCompose(false); refresh(); }} /><Link className="btn small primary hide-sm" href="/stage"><Play size={15} aria-hidden />{t("Present", "عرض")}</Link></>}</>}
    </Header>
    <OfflineBanner online={online} />
    {coordinator ? <><main id="main" className="canvas"><LiveMap places={data?.places ?? {}} interpreters={data?.interpreters ?? []} snap={activeSnap} now={now} padding={padding} /></main><RequesterSheet snap={snap} compose={compose} onComposeChange={setCompose} onCreated={(value) => { if (value) { setCreated(value); setCompose(false); } refresh(); }} />{!compose && <OfferDock snap={snap} interpreters={data?.interpreters ?? []} now={now} onDone={refresh} />}<ActivityDrawer open={drawer} onClose={() => setDrawer(false)} events={events} metrics={data?.metrics} escalations={data?.escalations} onDone={refresh} /></> : <main id="main" className="resident-grid">
      <section className="resident-intro">
        <div className="service-label"><Hand size={18} aria-hidden />{t("Sign language support in Dubai", "دعم بلغة الإشارة في دبي")}</div>
        <h1>{t("Your next appointment,", "موعدك القادم،")} <span>{t("on your terms.", "بالطريقة التي تناسبك.")}</span></h1>
        <p className="intro-description">{t("Find a sign language interpreter. Check the details, choose your language, and follow every update in text.", "اعثر على مترجم لغة إشارة. راجع التفاصيل، واختر لغتك، وتابع كل تحديث بالنص.")}</p>
        <div className="resident-start"><a className="btn primary" href="#msg">{t("Start a request", "ابدأ طلبك")}<ArrowRight size={18} aria-hidden /></a><a className="text-link" href="#how-it-works">{t("How it works", "كيف تعمل إشارة")}</a></div>
        <div className="resident-assurance"><Check size={18} aria-hidden />{t("No phone call required. You stay in control.", "دون مكالمة هاتفية. القرار بيدك.")}</div>
      </section>
      <div id="request-panel" className="resident-request"><RequesterSheet snap={null} onCreated={(created) => { if (created) router.push(`/r/${created.token}`); }} /><p className="prototype-note">{t("Service prototype. An interpreter is confirmed only when they accept your request.", "نموذج أولي للخدمة. لا يتأكد توفر المترجم إلا بعد قبوله طلبك.")}</p></div>
      <section id="how-it-works" className="resident-journey"><h2>{t("From message to support", "من رسالة إلى دعم")}</h2><ol className="resident-steps">
          {[["Share your appointment", "شارك موعدك", "Paste a message from your hospital, school or service centre.", "ألصق رسالة المستشفى أو المدرسة أو مركز الخدمة."], ["Make it yours", "اضبط التفاصيل كما تناسبك", "Check the place and time. Choose your sign language before matching starts.", "راجع المكان والوقت، واختر لغة الإشارة قبل بدء المطابقة."], ["Follow every update", "تابع كل تحديث", "See who accepts and the arrival time they share. Get support if plans change.", "اطلع على المترجم الذي يقبل ووقت الوصول الذي يشاركه. يتوفر الدعم عند تغير الخطط."]].map(([en, ar, detailEn, detailAr], i) => <li key={en}><span aria-hidden>{i + 1}</span><div><strong>{t(en, ar)}</strong><p>{t(detailEn, detailAr)}</p></div></li>)}
      </ol></section>
      <section className="resident-help" aria-labelledby="before-heading"><div><span className="service-label">{t("A little clarity", "تفاصيل تهمك")}</span><h2 id="before-heading">{t("Before you begin", "قبل أن تبدأ")}</h2><p>{t("Your language, your pace, your choice.", "لغتك، ووتيرتك، واختيارك.")}</p></div><div className="resident-questions">
        {[["What do I need to get started?", "ما الذي أحتاجه للبدء؟", "An appointment message with the place, date and time. You can correct the details before asking us to find an interpreter.", "رسالة موعد تتضمن المكان والتاريخ والوقت. يمكنك تصحيح التفاصيل قبل طلب البحث عن مترجم."], ["What if an interpreter is unavailable?", "ماذا لو لم يتوفر مترجم؟", "Your request goes to the coordinator queue. You can also open remote video support from your request page. A cancellation starts a new search.", "يُضاف طلبك إلى قائمة انتظار المنسق. يمكنك أيضاً فتح دعم الفيديو عن بُعد من صفحة طلبك. وعند الاعتذار يبدأ بحث جديد."], ["Can I change how Ishara looks?", "هل يمكنني تغيير طريقة عرض إشارة؟", "Use Display & accessibility at the top of the page for larger text, high contrast, reduced motion or text-first mode. You can switch the interface to Arabic too.", "استخدم إعدادات العرض وإمكانية الوصول أعلى الصفحة لتكبير النص أو زيادة التباين أو تقليل الحركة أو تفعيل وضع النص أولاً. يمكنك أيضاً تحويل الواجهة إلى العربية."], ["What happens to my contact details?", "ماذا يحدث لبيانات الاتصال؟", "Phone numbers, email addresses and ID numbers are hidden before storage. Only include information needed for your appointment.", "تُحجب أرقام الهاتف وعناوين البريد وأرقام الهوية قبل التخزين. أدرج المعلومات اللازمة لموعدك فقط."]].map(([en, ar, detailEn, detailAr]) => <details key={en}><summary>{t(en, ar)}</summary><p>{t(detailEn, detailAr)}</p></details>)}
      </div></section>
      <footer className="resident-footer"><span translate="no">Ishara · إشارة</span><span>{t("Built around choice, dignity and access.", "صُممت حول الاختيار والكرامة وإمكانية الوصول.")}</span></footer>
    </main>}
  </div></MotionRoot>;
}
