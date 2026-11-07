"use client";

import { ArrowUpRight, History, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { forgetRequest, requestTokens } from "@/lib/request-history";
import type { Snapshot } from "@/lib/types";

type Entry = Pick<Snapshot, "id" | "created_at" | "status" | "requester_name" | "appointment"> & { token?: string };
const STATES = {
  parsing: ["Reading message", "قراءة الرسالة"], reviewing: ["Needs your review", "بانتظار مراجعتك"], dispatching: ["Finding an interpreter", "البحث عن مترجم"], replanning: ["Finding a replacement", "البحث عن بديل"], confirmed: ["Interpreter confirmed", "تم تأكيد المترجم"], escalated: ["Needs coordinator support", "بحاجة إلى دعم المنسق"], completed: ["Visit complete", "اكتملت الزيارة"],
};

export function RequestHistory({ coordinator = false, onSelect }: { coordinator?: boolean; onSelect?: (snap: Snapshot) => void }) {
  const { t, lang } = useLanguage();
  const selecting = useRef(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setEntries([]); setUnavailable([]); setBusy(true);
    async function load() {
      setError(null);
      try {
        if (coordinator) {
          const rows = await api.requests();
          if (current) setEntries(rows);
        } else {
          const tokens = requestTokens();
          const results = await Promise.allSettled(tokens.map(token => api.requester(token)));
          if (current) {
            setEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
            setUnavailable(tokens.filter((_, i) => results[i].status === "rejected"));
          }
        }
      } catch (e) { if (current) setError((e as Error).message); }
      finally { if (current && !selecting.current) setBusy(false); }
    }
    load();
    const poll = setInterval(load, 15000);
    return () => { current = false; clearInterval(poll); };
  }, [open, coordinator]);
  async function select(id: string) {
    if (busy || selecting.current) return;
    selecting.current = true;
    setBusy(true); setError(null);
    try { onSelect?.(await api.request(id)); setOpen(false); }
    catch (e) { setError((e as Error).message); }
    finally { selecting.current = false; setBusy(false); }
  }
  function remove(token: string) {
    if (!forgetRequest(token)) {
      setError(t("The link could not be removed. Clear this site's browser data on a shared device.", "تعذر حذف الرابط. امسح بيانات هذا الموقع من المتصفح على الجهاز المشترك."));
      return;
    }
    setEntries(rows => rows.filter(row => row.token !== token));
    setUnavailable(tokens => tokens.filter(value => value !== token));
  }
  return <>
    <button type="button" className="btn small request-history-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}><History size={18} aria-hidden />{t("Requests", "الطلبات")}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={coordinator ? t("Recent requests", "الطلبات الأخيرة") : t("Your requests", "طلباتك")} closeLabel={t("Close requests", "إغلاق الطلبات")}>
      <p className="small muted">{coordinator ? t("The 100 most recent requests. Choose one to manage it.", "أحدث ١٠٠ طلب. اختر طلباً لإدارته.") : t("Private links saved on this browser, including requests opened before. Remove them on a shared device. Removing a link does not cancel the request.", "روابط خاصة محفوظة في هذا المتصفح، بما فيها الطلبات التي فتحتها سابقاً. احذفها على الأجهزة المشتركة. حذف الرابط لا يلغي الطلب.")}</p>
      {busy && <p className="history-status" role="status">{t("Updating requests…", "جارٍ تحديث الطلبات…")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!busy && !error && entries.length === 0 && unavailable.length === 0 && <p className="history-status">{t("No requests here yet", "لا توجد طلبات بعد")}</p>}
      <ul className="request-history-list">
        {entries.map(row => <li key={row.id}>
          {coordinator ? <button type="button" className="history-request" disabled={busy} onClick={() => select(row.id)}><HistoryCopy row={row} lang={lang} showName /><ArrowUpRight size={18} aria-hidden /></button> : <Link className="history-request" href={`/r/${row.token}`} onClick={() => setOpen(false)}><HistoryCopy row={row} lang={lang} /><ArrowUpRight size={18} aria-hidden /></Link>}
          {!coordinator && row.token && <button type="button" className="icon-btn" aria-label={t(`Remove ${row.appointment.entity} from this browser`, `حذف ${row.appointment.entity} من هذا المتصفح`)} onClick={() => remove(row.token!)}><X size={16} aria-hidden /></button>}
        </li>)}
        {unavailable.map(token => <li key={token}><Link className="history-request" href={`/r/${token}`} onClick={() => setOpen(false)}><span>{t("Saved request", "طلب محفوظ")}<small>{t("Could not refresh. Open your private link to retry.", "تعذر التحديث. افتح رابطك الخاص للمحاولة مجدداً.")}</small></span><ArrowUpRight size={18} aria-hidden /></Link><button type="button" className="icon-btn" aria-label={t("Remove saved link", "حذف الرابط المحفوظ")} onClick={() => remove(token)}><X size={16} aria-hidden /></button></li>)}
      </ul>
    </Modal>
  </>;
}

function HistoryCopy({ row, lang, showName = false }: { row: Entry; lang: "en" | "ar"; showName?: boolean }) {
  const state = STATES[row.status];
  return <span><strong dir="auto">{showName && row.requester_name ? `${row.requester_name} · ` : ""}{row.appointment.entity}</strong><small>{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(row.appointment.starts_at * 1000)}</small><small className="history-state">{state[lang === "ar" ? 1 : 0]}</small></span>;
}
