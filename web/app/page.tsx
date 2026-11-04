"use client";

import { Activity, ArrowRight, CircleHelp, Hand, Menu, Play, Settings2, Users, X } from "lucide-react";
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
import { DisplaySettingsDialog, LanguageToggle, useLanguage } from "@/components/Preferences";
import { RequesterSheet } from "@/components/RequesterSheet";
import { WelcomeArt } from "@/components/WelcomeArt";
import { Popover } from "@/components/ui";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
    <Header status={coordinator ? activeSnap?.status : undefined}>
      <LanguageToggle />
      <Popover label={t("Menu", "القائمة")} align="end" trigger={<span className="btn small menu-toggle"><Menu size={18} aria-hidden />{t("Menu", "القائمة")}</span>}>
        {(close) => <div className="workspace-menu">
          <div className="workspace-menu-head"><div><h2>{coordinator ? t("Coordinator", "المنسق") : t("Ishara", "إشارة")}</h2><Connection online={online} /></div><button type="button" className="icon-btn" aria-label={t("Close menu", "إغلاق القائمة")} onClick={close}><X size={18} aria-hidden /></button></div>
          {session?.authenticated && !coordinator && <p className="workspace-label">{t("Staff tools", "أدوات الموظفين")}</p>}
          <div className="workspace-actions">
            {session?.authenticated && <button type="button" onClick={() => { setMode(coordinator ? "resident" : "coordinator"); close(); }}><Users size={18} aria-hidden />{coordinator ? t("Requester view", "عرض طالب الخدمة") : t("Coordinator", "المنسق")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></button>}
            {coordinator && <button type="button" onClick={() => { close(); setDrawer(true); }}><Activity size={18} aria-hidden />{t("Activity & support", "النشاط والدعم")}{events.length > 0 && <span className="workspace-count num">{events.length}</span>}</button>}
            {coordinator && data?.config.demo && <Link href="/stage" onClick={close}><Play size={18} aria-hidden />{t("Presentation", "العرض التقديمي")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></Link>}
            <button type="button" aria-haspopup="dialog" onClick={() => { close(); setSettingsOpen(true); }}><Settings2 size={18} aria-hidden />{t("Display & accessibility", "العرض وإمكانية الوصول")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></button>
            <button type="button" aria-haspopup="dialog" onClick={() => { close(); setHelpOpen(true); }}><CircleHelp size={18} aria-hidden />{t("How Ishara works", "كيف تعمل إشارة")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></button>
          </div>
          <div className="workspace-session"><OperatorAccess session={session} authRequired={authRequired} onChange={(s) => { setSession(s); setServiceError(false); if (s.authenticated) setMode("coordinator"); close(); }} />{coordinator && data?.config.demo && <ResetButton onDone={() => { setCreated(null); setCompose(false); refresh(); close(); }} />}</div>
        </div>}
      </Popover>
    </Header>
    <DisplaySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />
    <OfflineBanner online={online} />
    {coordinator ? <><main id="main" className="canvas"><LiveMap places={data?.places ?? {}} interpreters={data?.interpreters ?? []} snap={activeSnap} now={now} padding={padding} /></main><RequesterSheet snap={snap} compose={compose} onComposeChange={setCompose} onCreated={(value) => { if (value) { setCreated(value); setCompose(false); } refresh(); }} />{!compose && <OfferDock snap={snap} interpreters={data?.interpreters ?? []} now={now} onDone={refresh} />}<ActivityDrawer open={drawer} onClose={() => setDrawer(false)} events={events} metrics={data?.metrics} escalations={data?.escalations} onDone={refresh} /></> : <main id="main" className="resident-grid">
      <section className="resident-intro">
        <div className="service-label"><Hand size={18} aria-hidden />{t("Sign language support · Dubai", "دعم بلغة الإشارة · دبي")}</div>
        <h1>{t("Your appointment.", "موعدك.")} <span>{t("Your way.", "بطريقتك.")}</span></h1>
        <p className="intro-description">{t("Find a sign language interpreter. Review your details, then follow every update in text.", "اعثر على مترجم لغة إشارة. راجع التفاصيل، ثم تابع كل تحديث بالنص.")}</p>
        <div className="welcome-guide"><WelcomeArt />
          <ol className="resident-flow" aria-label={t("How your request works", "كيف يعمل طلبك")}>
            {[["Share", "شارك"], ["Review", "راجع"], ["Follow", "تابع"]].map(([en, ar]) => <li key={en}>{t(en, ar)}</li>)}
          </ol>
        </div>
      </section>
      <div id="request-panel" className="resident-request"><RequesterSheet snap={null} onCreated={(created) => { if (created) router.push(`/r/${created.token}`); }} /><p className="prototype-note">{t("Service prototype. An interpreter is confirmed only when they accept your request.", "نموذج أولي للخدمة. لا يتأكد توفر المترجم إلا بعد قبوله طلبك.")}</p></div>
      <footer className="resident-footer"><span>{t("No phone call needed.", "دون مكالمة هاتفية.")}</span><span>{t("Help in Menu", "المساعدة في القائمة")}</span></footer>
    </main>}
  </div></MotionRoot>;
}
