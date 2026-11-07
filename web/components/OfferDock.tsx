"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { ArrivalControls } from "@/components/ArrivalControls";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Interp, Snapshot } from "@/lib/types";

// Demo control: answer as each interpreter, the way they would on their phone.
export function OfferDock({ snap, interpreters, now, onDone, interactive = true }: { snap: Snapshot | null; interpreters: Interp[]; now: number; onDone: () => void | Promise<void>; interactive?: boolean }) {
  const { t } = useLanguage();
  const inFlight = useRef(false);
  const [detail, setDetail] = useState<{ name: string; reasons: string[]; backup: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const byId = Object.fromEntries(interpreters.map((i) => [i.id, i]));
  const pending = (snap?.offers ?? []).filter((o) => o.status === "pending");
  const assigned = snap?.status === "confirmed" && snap.assigned ? byId[snap.assigned.id] : null;

  async function run(fn: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <><Modal open={detail !== null} onClose={() => setDetail(null)} title={t(`Why ${detail?.name ?? "this interpreter"}`, `سبب اختيار ${detail?.name ?? "هذا المترجم"}`)} closeLabel={t("Close interpreter details", "إغلاق تفاصيل المترجم")}>
      <ul className="offer-reasons">{detail?.reasons.map(reason => <li key={reason}>{reason.charAt(0).toUpperCase() + reason.slice(1)}</li>)}</ul>
      {detail?.backup && <p className="small muted">{t("Held as backup, so the reply window is shorter.", "محجوز كاحتياطي، لذا تكون مهلة الرد أقصر.")}</p>}
    </Modal><div className="dock" aria-label={t("Interpreter phones", "هواتف المترجمين")}>
      <AnimatePresence mode="popLayout">
        {snap?.status === "escalated" && (
          <m.article key="esc" className="note" layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="note-head"><span className="avatar bad" aria-hidden><CircleAlert size={18} /></span><div><strong>{t("Coordinator support", "دعم المنسق")}</strong><small>{t("No qualified interpreter is confirmed.", "لم يُؤكد مترجم مؤهل.")}</small></div></div>
            <p>{snap?.escalation?.status === "acknowledged" ? t("A coordinator has acknowledged this request.", "أكد المنسق استلام هذا الطلب.") : t("This request is queued for a coordinator. Acknowledgment is pending.", "أُضيف الطلب إلى قائمة انتظار المنسق، وبانتظار تأكيد الاستلام.")}</p>
          </m.article>
        )}
        {pending.map((o) => {
          const it = byId[o.interpreter_id];
          const left = Math.max(0, Math.ceil(o.expires_at - now));
          const frac = Math.max(0, Math.min(1, (o.expires_at - now) / Math.max(1, o.expires_at - o.sent_at)));
          const backup = o.wave === 0;
          return (
            <m.article key={o.id} className="note" layout initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
              <div className="note-head">
                <span className="avatar" aria-hidden>{initials(it?.name ?? "?")}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{it?.name}</strong>
                  <small>{interactive ? t("Demo · respond as interpreter", "تجربة · الرد بدور المترجم") : t("Awaiting interpreter response", "بانتظار رد المترجم")}</small>
                  <small className="num">{backup ? t("Backup offer", "عرض احتياطي") : t("New offer", "عرض جديد")}, {left} {t("s left", "ث متبقية")}</small>
                </div>
                <button type="button" className="icon-btn" aria-haspopup="dialog" aria-label={t(`Why ${it?.name}`, `سبب اختيار ${it?.name}`)} onClick={() => setDetail({ name: it?.name ?? "", reasons: o.reasons, backup })}><Info size={18} aria-hidden /></button>
              </div>
              <div className="timer" aria-hidden><div style={{ transform: `scaleX(${frac})` }} /></div>
              {interactive && (
                <div className="row">
                  <button className="btn small" disabled={busy || left === 0 || !it?.token} onClick={() => run(() => api.decline(it!.token!, o.id))}><X size={16} aria-hidden />{t("Decline", "اعتذار")}</button>
                  <button className="btn small primary" disabled={busy || left === 0 || !it?.token} onClick={() => run(() => api.accept(it!.token!, o.id))}><Check size={16} aria-hidden />{t("Accept", "قبول")}</button>
                </div>
              )}
            </m.article>
          );
        })}
        {assigned?.token && (
          <m.article key={`a-${assigned.id}`} className="note" layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
            <div className="note-head">
              <span className="avatar ok" aria-hidden>{initials(assigned.name)}</span>
              <div><strong>{assigned.name}</strong><small>{t("Confirmed and briefed", "مؤكد ومستعد")}</small></div>
            </div>
            {interactive && (
              <>
                <ArrivalControls token={assigned.token} requestId={snap!.id} arrival={snap!.arrival} onDone={onDone} />
                <input aria-label={t("Visit notes", "ملاحظات الزيارة")} name="notes" autoComplete="off" placeholder={t("Visit notes, e.g. return in two weeks…", "ملاحظات الزيارة، مثال: مراجعة بعد أسبوعين…")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="row">
                  <button className="btn small danger" disabled={busy} onClick={() => run(() => api.cancel(assigned.token!, snap!.id))}>{t("Cancel as interpreter", "إلغاء من المترجم")}</button>
                  <button className="btn small primary" disabled={busy} onClick={() => run(() => api.complete(assigned.token!, snap!.id, notes))}><Check size={16} aria-hidden />{t("Complete visit", "إكمال الزيارة")}</button>
                </div>
              </>
            )}
          </m.article>
        )}
      </AnimatePresence>
      {err && <p className="error dock-error" role="alert">{err}</p>}
    </div></>
  );
}
