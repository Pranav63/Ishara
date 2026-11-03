"use client";

import { AnimatePresence, m } from "motion/react";
import { use, useState } from "react";
import { MotionRoot } from "@/components/Motion";
import { ArrivalControls } from "@/components/ArrivalControls";
import { DisplaySettings, useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { areaName, languageName } from "@/lib/locale";
import { clock, when } from "@/lib/format";
import { useLive, useNow } from "@/lib/live";

export default function InterpreterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, lang } = useLanguage();
  const { data, error, refresh } = useLive(() => api.interpreter(token), { interpreterToken: token });
  const now = useNow(data?.now);
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (error && !data) return <main id="main" className="phone"><DisplaySettings inline /><div className="card"><h2>{t("Could not load your interpreter page.", "تعذر تحميل صفحة المترجم.")}</h2><p className="muted">{t("Check your connection or ask the coordinator to verify the link.", "تحقق من اتصالك أو اطلب من المنسق التحقق من الرابط.")}</p><button className="btn" onClick={refresh}>{t("Try again", "حاول مرة أخرى")}</button></div></main>;
  if (!data) return <main id="main" className="phone" aria-busy="true"><p role="status">{t("Loading your offers…", "جارٍ تحميل عروضك…")}</p></main>;

  return (
    <MotionRoot>
      <main id="main" className="phone">
        <DisplaySettings inline />
        {error && <p className="error" role="alert">{t("Connection lost. These details may be out of date.", "انقطع الاتصال. قد تكون هذه التفاصيل قديمة.")}</p>}
        <div className="card">
          <p className="muted small">{t("Signed in as", "مسجل الدخول باسم")}</p>
          <h1>{data.interpreter.name}</h1>
          <p className="muted">{areaName(data.interpreter.area, lang)}</p>
        </div>
        {data.items.length === 0 && <div className="card"><p className="muted">{t("No offers right now. New ones appear here and stay open for a short time.", "لا توجد عروض حالياً. تظهر العروض الجديدة هنا وتبقى متاحة لوقت قصير.")}</p></div>}
        <AnimatePresence initial={false}>
          {data.items.map(({ offer, request, briefing, arrival }) => {
            const a = request.appointment;
            const left = Math.max(0, Math.ceil(offer.expires_at - now));
            const frac = Math.max(0, Math.min(1, (offer.expires_at - now) / Math.max(1, offer.expires_at - offer.sent_at)));
            return (
              <m.article key={offer.id} className="card" layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
                <h2>{a.entity}</h2>
                <p className="muted">{when(a.starts_at)}</p>
                <p className="muted small">{languageName(a.language, lang)}, {offer.travel_min} {t("min from you", "دقيقة من موقعك")}</p>
                {offer.status === "pending" && (
                  <>
                    <div className="timer" aria-hidden><div style={{ transform: `scaleX(${frac})` }} /></div>
                    <p className="small muted num">{left} {t("s to reply", "ثانية للرد")}</p>
                    <div className="row">
                      <button className="btn" onClick={() => act(() => api.decline(token, offer.id))}>{t("Decline", "اعتذار")}</button>
                      <button className="btn primary" onClick={() => act(() => api.accept(token, offer.id))}>{t("Accept", "قبول")}</button>
                    </div>
                  </>
                )}
                {offer.status === "standby" && <p className="small">{t("You are the backup. If the assigned interpreter cancels, this job comes to you first.", "أنت المترجم الاحتياطي. إذا اعتذر المترجم المعين، يُعرض عليك الطلب أولاً.")}</p>}
                {offer.status === "accepted" && briefing && (
                  <>
                    <p>{t("Leave by", "غادر بحلول")} <b className="num">{clock(briefing.leave_by)}</b> {t("to arrive by", "لتصل بحلول")} <b className="num">{clock(briefing.arrive_by)}</b>.</p>
                    <div className="tags">{briefing.vocabulary.map((v) => <span key={v}>{v}</span>)}</div>
                    <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{briefing.practice.map((p) => <li key={p}>{p}</li>)}</ul>
                    <ArrivalControls token={token} requestId={request.id} arrival={arrival} onDone={refresh} />
                    <button className="btn danger" onClick={() => act(() => api.cancel(token, request.id))}>{t("I can no longer attend", "لم أعد قادراً على الحضور")}</button>
                  </>
                )}
              </m.article>
            );
          })}
        </AnimatePresence>
        {err && <p className="error" role="alert">{err}</p>}
      </main>
    </MotionRoot>
  );
}
