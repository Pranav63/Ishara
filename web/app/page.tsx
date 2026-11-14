"use client";

import { Activity, ArrowRight, ChevronDown, CircleHelp, Mail, Menu, MessageCircle, MessageSquare, Play, Send, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequestHistory } from "@/components/RequestHistory";
import { CoordinatorOverview } from "@/components/CoordinatorOverview";
import { ActivityDrawer } from "@/components/ActivityDrawer";
import { Connection, OfflineBanner, ResetButton, useMapPadding } from "@/components/Chrome";
import { Header } from "@/components/Header";
import { HomePreview, useDraftReading } from "@/components/HomePreview";
import { HowItWorks } from "@/components/HowItWorks";
import { Story } from "@/components/Story";
import { LiquidThumb } from "@/components/LiquidThumb";
import { LiveMap } from "@/components/LiveMap";
import { MotionRoot } from "@/components/Motion";
import { OfferDock } from "@/components/OfferDock";
import { OperatorAccess } from "@/components/OperatorAccess";
import { DisplaySettingsDialog, LanguageToggle, useLanguage } from "@/components/Preferences";
import { RequesterSheet } from "@/components/RequesterSheet";
import { Popover } from "@/components/ui";
import { api, type OperatorSession } from "@/lib/api";
import { useLive, useNow } from "@/lib/live";
import type { Snapshot } from "@/lib/types";

async function load(requestId: string | null) {
  const [snap, interpreters, metrics, config, places, escalations] = await Promise.all([requestId ? api.request(requestId) : api.latest(), api.interpreters(), api.metrics(), api.config(), api.places(), api.escalations()]);
  return { snap, interpreters, metrics, config, places, escalations };
}

export default function Console() {
  const { t } = useLanguage();
  const router = useRouter();
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [authRequired, setAuthRequired] = useState(true);
  const [telegram, setTelegram] = useState<string | null>(null);
  const [serviceState, setServiceState] = useState<"checking" | "online" | "offline">("checking");
  const [mode, setMode] = useState<"resident" | "coordinator">("resident");
  const workspace = useRef<HTMLDivElement>(null);
  const [compose, setCompose] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [created, setCreated] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState("");
  const checkService = useCallback(() => Promise.all([api.session(), api.config()]).then(([value, config]) => { setSession(value); setAuthRequired(config.operator_auth_required); setTelegram(config.telegram); setServiceState("online"); }).catch(() => setServiceState("offline")), []);
  useEffect(() => {
    checkService();
    const poll = setInterval(checkService, 15000);
    return () => clearInterval(poll);
  }, [checkService]);
  // A requester demo page links here to answer as the interpreters for one request.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("coordinator");
    if (!id) return;
    setMode("coordinator"); setSelectedId(id);
    history.replaceState(null, "", "/");
  }, []);
  function retryService() { setServiceState("checking"); checkService(); }
  const coordinator = mode === "coordinator" && session?.authenticated === true;
  const { data, error, refresh } = useLive(() => load(selectedId), { enabled: coordinator });
  useEffect(() => { if (selectedId) refresh(); }, [selectedId, refresh]);
  useEffect(() => { if (!coordinator) { setCompose(false); setCreated(null); } }, [coordinator]);
  useEffect(() => { if (created && data?.snap?.id === created.id) setCreated(null); }, [created, data?.snap]);
  const [drawer, setDrawer] = useState(false);
  const padding = useMapPadding(drawer);
  const snap = created ?? data?.snap ?? null;
  const activeSnap = compose ? null : snap;
  const now = useNow(snap?.now);
  const events = activeSnap?.events ?? [];
  const availability = serviceState === "checking" ? "checking" : serviceState === "offline" || error ? "offline" : "online";
  const online = availability === "online";
  const draftReading = useDraftReading(coordinator ? "" : draft, online);

  return <MotionRoot><div className={`${coordinator ? "console-view" : "resident-home"}${drawer ? " drawer-open" : ""}`}>
    <Header status={coordinator ? activeSnap?.status : undefined} navigation={<>
      {session?.authenticated && <div ref={workspace} className="workspace-switch liquid-tabs" role="group" aria-label={t("Workspace", "مساحة العمل")}>
        <LiquidThumb group={workspace} index={mode === "resident" ? 0 : 1} />
        {(["resident", "coordinator"] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setDrawer(false); }}><span>{value === "resident" ? t("Requester", "طالب الخدمة") : t("Coordinator", "المنسق")}</span></button>)}
      </div>}
      <RequestHistory key={coordinator ? "coordinator" : "requester"} coordinator={coordinator} onSelect={value => { setCreated(value); setSelectedId(value.id); setCompose(false); setDrawer(false); }} />
    </>}>
      <LanguageToggle />
      <Popover label={t("Menu", "القائمة")} align="end" trigger={<span className="btn small menu-toggle"><Menu size={18} aria-hidden /><span className="btn-label">{t("Menu", "القائمة")}</span></span>}>
        {(close) => <div className="workspace-menu">
          <div className="workspace-menu-head"><div><h2>{coordinator ? t("Coordinator", "المنسق") : t("Ishara", "إشارة")}</h2><Connection online={online} /></div><button type="button" className="icon-btn" aria-label={t("Close menu", "إغلاق القائمة")} onClick={close}><X size={18} aria-hidden /></button></div>
          <div className="workspace-actions">
            {coordinator && <button type="button" onClick={() => { close(); setDrawer(true); }}><Activity size={18} aria-hidden />{t("Activity & support", "النشاط والدعم")}{events.length > 0 && <span className="workspace-count num">{events.length}</span>}</button>}
            {coordinator && data?.config.demo && <Link href="/stage" onClick={close}><Play size={18} aria-hidden />{t("Presentation", "العرض التقديمي")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></Link>}
            <button type="button" aria-haspopup="dialog" onClick={() => { close(); setSettingsOpen(true); }}><Settings2 size={18} aria-hidden />{t("Display & accessibility", "العرض وإمكانية الوصول")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></button>
            <button type="button" aria-haspopup="dialog" onClick={() => { close(); setHelpOpen(true); }}><CircleHelp size={18} aria-hidden />{t("How Ishara works", "كيف تعمل إشارة")}<ArrowRight className="workspace-arrow" size={16} aria-hidden /></button>
          </div>
          <div className="workspace-session"><OperatorAccess session={session} authRequired={authRequired} onChange={(s) => { setSession(s); setServiceState("online"); if (s.authenticated) setMode("coordinator"); close(); }} />{coordinator && data?.config.demo && <ResetButton onDone={() => { setCreated(null); setSelectedId(null); setCompose(false); refresh(); close(); }} />}</div>
        </div>}
      </Popover>
    </Header>
    <DisplaySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />
    {coordinator && <OfflineBanner online={availability !== "offline"} />}
    {coordinator ? <><main id="main" className="canvas"><LiveMap places={data?.places ?? {}} interpreters={data?.interpreters ?? []} snap={activeSnap} now={now} padding={padding} /></main>{!snap && !compose ? <CoordinatorOverview interpreters={data?.interpreters ?? []} metrics={data?.metrics} onNew={() => setCompose(true)} onActivity={() => setDrawer(true)} /> : <RequesterSheet snap={snap} availability={availability} onRetry={retryService} compose={compose} onComposeChange={setCompose} onCreated={(value) => { if (value) { setCreated(value); setSelectedId(value.id); setCompose(false); } refresh(); }} />}{!compose && <OfferDock key={activeSnap?.id} snap={activeSnap} interpreters={data?.interpreters ?? []} now={now} onDone={refresh} interactive={data?.config.demo === true} />}<ActivityDrawer open={drawer} onClose={() => setDrawer(false)} events={events} metrics={data?.metrics} escalations={data?.escalations} onDone={refresh} /></> : <main id="main" className="resident-main"><div className="resident-grid">
      <section className="resident-intro">
        <h1>{t("Book a sign language interpreter", "احجز مترجم لغة إشارة")}</h1>
        <p className="intro-description">{t("Paste your appointment message. Ishara books the interpreter.", "ألصق رسالة موعدك، وتحجز إشارة المترجم.")}</p>
        <ul className="intro-sources" aria-label={t("Works with messages from", "يعمل مع رسائل من")}>
          <li className="src-sms"><MessageSquare size={14} aria-hidden />SMS</li>
          <li className="src-mail"><Mail size={14} aria-hidden />{t("Email", "البريد")}</li>
          <li className="src-wa"><MessageCircle size={14} aria-hidden />WhatsApp</li>
        </ul>
      </section>
      <div id="request-panel" className="resident-request"><RequesterSheet snap={null} availability={availability} onRetry={retryService} onDraft={setDraft} reading={draftReading.busy} onCreated={(created) => { if (created) router.push(`/r/${created.token}`); }} />{telegram && <p className="telegram-note"><Send size={15} aria-hidden />{t("Prefer Telegram? Forward the message to ", "تفضّل تيليجرام؟ أعد توجيه الرسالة إلى ")}<a href={`https://t.me/${telegram}`} target="_blank" rel="noopener noreferrer" dir="ltr">@{telegram}</a>{t(" and get updates there.", " واستلم التحديثات هناك.")}</p>}<p className="prototype-note">{t("Prototype. A booking is confirmed only when an interpreter accepts.", "نموذج أولي. يتأكد الحجز فقط عند قبول مترجم.")}</p></div>
      <HomePreview reading={draftReading.reading} busy={draftReading.busy} />
      <a className="story-link" href="#how-it-works"><ChevronDown size={16} aria-hidden />{t("How it works", "كيف تعمل")}</a>
    </div>
    <Story />
    </main>}
  </div></MotionRoot>;
}
