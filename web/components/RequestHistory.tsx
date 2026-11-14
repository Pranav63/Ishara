"use client";

import { AnimatePresence, m } from "motion/react";
import { Archive, ArchiveRestore, ArrowUpRight, CalendarDays, ChevronDown, History, Inbox, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { LiquidThumb } from "@/components/LiquidThumb";
import { Modal } from "@/components/ui";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";
import { archiveRequest, archiveRequests, archivedRequestTokens, filterHistory, forgetRequest, HISTORY_FILTERS, requestTokens, type HistoryEntry, type HistoryFilters } from "@/lib/request-history";
import type { Snapshot } from "@/lib/types";

const STATES = {
  parsing: ["Reading message", "قراءة الرسالة"], reviewing: ["Needs your review", "بانتظار مراجعتك"], dispatching: ["Finding an interpreter", "البحث عن مترجم"], replanning: ["Finding a replacement", "البحث عن بديل"], confirmed: ["Interpreter confirmed", "تم تأكيد المترجم"], escalated: ["Needs coordinator support", "بحاجة إلى دعم المنسق"], completed: ["Visit complete", "اكتملت الزيارة"],
};

const TONES: Record<string, string> = { parsing: "live", reviewing: "warn", dispatching: "live", replanning: "live", confirmed: "ok", escalated: "bad", completed: "done" };

export function RequestHistory({ coordinator = false, onSelect }: { coordinator?: boolean; onSelect?: (snap: Snapshot) => void }) {
  const { t, lang } = useLanguage();
  const filterId = useId();
  const [showFilters, setShowFilters] = useState(false);
  const acting = useRef(false);
  const views = useRef<HTMLDivElement>(null);
  const archiveFocus = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const [localArchives, setLocalArchives] = useState<string[]>([]);
  const [filters, setFilters] = useState(HISTORY_FILTERS);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulk, setBulk] = useState<HistoryEntry[] | null>(null);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  // Requester filters run locally; only coordinator filters trigger a new server search.
  const serverFilters = coordinator ? filters : HISTORY_FILTERS;
  useEffect(() => {
    if (!open || invalidDates) return;
    let current = true;
    setLoading(true); setError(null);
    async function load() {
      if (acting.current) return;
      try {
        if (coordinator) {
          const rows = await api.requests(archived, serverFilters);
          if (current) { setEntries(rows); setError(null); }
        } else {
          const tokens = requestTokens();
          const results = await Promise.allSettled(tokens.map(token => api.requester(token)));
          if (current) {
            setError(null);
            setEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
            setUnavailable(tokens.filter((_, i) => results[i].status === "rejected"));
            setLocalArchives(archivedRequestTokens());
          }
        }
      } catch (e) { if (current) setError((e as Error).message); }
      finally { if (current) setLoading(false); }
    }
    const first = setTimeout(load, coordinator ? 250 : 0);
    const poll = setInterval(load, 15000);
    return () => { current = false; clearTimeout(first); clearInterval(poll); };
  }, [open, coordinator, archived, serverFilters, revision, invalidDates]);
  useEffect(() => { if (notice && !busy) archiveFocus.current?.focus(); }, [notice, busy]);
  async function select(id: string) {
    if (loading || acting.current) return;
    acting.current = true;
    setBusy(true); setError(null);
    try { onSelect?.(await api.request(id)); setOpen(false); }
    catch (e) { setError((e as Error).message); }
    finally { acting.current = false; setBusy(false); }
  }
  async function archive(row: HistoryEntry) {
    if (acting.current) return;
    acting.current = true; setBusy(true); setError(null);
    try {
      if (coordinator) await api.archiveRequest(row.id, !archived);
      else {
        if (!row.token || !archiveRequest(row.token, !archived)) throw new Error(t("Could not save the archive change in this browser. Please try again.", "تعذر حفظ تغيير الأرشيف في هذا المتصفح. يرجى المحاولة مجدداً."));
        setLocalArchives(archivedRequestTokens());
      }
      setEntries(rows => rows.filter(value => value.id !== row.id));
      setNotice(archived ? t("Request restored to Current", "تمت إعادة الطلب إلى الحالية") : row.status === "completed" ? t("Request archived", "تمت أرشفة الطلب") : t("Request archived. Matching and support continue.", "تمت أرشفة الطلب. يستمر البحث عن مترجم والدعم."));
      setRevision(value => value + 1);
    } catch (e) { setError((e as Error).message); }
    finally { acting.current = false; setBusy(false); }
  }
  async function archiveAll() {
    if (!bulk || acting.current) return;
    acting.current = true; setBusy(true); setError(null);
    try {
      if (coordinator) await api.archiveRequests(bulk.map(row => row.id));
      else {
        if (!archiveRequests(bulk.map(row => row.token!))) throw new Error(t("Could not save the archive change in this browser. Please try again.", "تعذر حفظ تغيير الأرشيف في هذا المتصفح. يرجى المحاولة مجدداً."));
        setLocalArchives(archivedRequestTokens());
      }
      const ids = new Set(bulk.map(row => row.id));
      setEntries(current => current.filter(row => !ids.has(row.id)));
      setNotice(t(`${bulk.length} ${bulk.length === 1 ? "request" : "requests"} archived. Matching and support continue.`, `تمت أرشفة الطلبات المعروضة (${bulk.length}). يستمر البحث عن مترجم والدعم.`));
      setBulk(null); setRevision(value => value + 1);
    } catch (e) { setError((e as Error).message); }
    finally { acting.current = false; setBusy(false); }
  }
  function remove(token: string) {
    if (!forgetRequest(token)) {
      setError(t("The link could not be removed. Clear this site's browser data on a shared device.", "تعذر حذف الرابط. امسح بيانات هذا الموقع من المتصفح على الجهاز المشترك."));
      return;
    }
    setEntries(rows => rows.filter(row => row.token !== token));
    setUnavailable(tokens => tokens.filter(value => value !== token));
    setNotice(t("Private link removed from this browser", "تم حذف الرابط الخاص من هذا المتصفح"));
    setRevision(value => value + 1);
  }
  function update<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) {
    setFilters(current => ({ ...current, [key]: value })); setNotice(null);
  }
  const rows = invalidDates || (coordinator && loading) ? [] : filterHistory(entries.filter(row => coordinator || localArchives.includes(row.token!) === archived), filters);
  const missing = unavailable.filter(token => localArchives.includes(token) === archived);
  const changed = Object.keys(HISTORY_FILTERS).some(key => filters[key as keyof HistoryFilters] !== HISTORY_FILTERS[key as keyof HistoryFilters]);
  const extraCount = Number(Boolean(filters.from || filters.to)) + Number(filters.sort !== "newest");
  return <>
    <button type="button" className="btn small request-history-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}><History size={18} aria-hidden />{t("Requests", "الطلبات")}</button>
    <Modal wide open={open} onClose={() => setOpen(false)} title={coordinator ? t("Recent requests", "الطلبات الأخيرة") : t("Your requests", "طلباتك")} closeLabel={t("Close requests", "إغلاق الطلبات")}>
      <div className="history-toolbar">
        <div className="history-top">
          <div ref={views} className="history-views liquid-tabs" role="group" aria-label={t("Request list", "قائمة الطلبات")}>
            <LiquidThumb group={views} index={archived ? 1 : 0} />
            {([false, true] as const).map(value => <button key={String(value)} ref={archived === value ? archiveFocus : undefined} type="button" aria-pressed={archived === value} disabled={busy} onClick={() => { if (archived !== value) { setArchived(value); setEntries([]); setNotice(null); } }}>
              <span>{value ? <><Archive size={16} aria-hidden />{t("Archived", "المؤرشفة")}</> : <><Inbox size={16} aria-hidden />{t("Current", "الحالية")}</>}</span>
            </button>)}
          </div>
          <label className="history-search"><Search size={18} aria-hidden /><span className="sr-only">{t("Search requests", "البحث في الطلبات")}</span><input type="search" value={filters.query} maxLength={120} placeholder={t("Place, name or request ID", "المكان أو الاسم أو رقم الطلب")} onChange={e => update("query", e.target.value)} /></label>
        </div>
        <div className="history-filter-row">
          <select aria-label={t("Request status", "حالة الطلب")} value={filters.status} onChange={e => update("status", e.target.value as HistoryFilters["status"])}><option value="">{t("All statuses", "جميع الحالات")}</option>{Object.entries(STATES).map(([value, text]) => <option key={value} value={value}>{text[lang === "ar" ? 1 : 0]}</option>)}</select>
          <button type="button" className="btn small history-filter-toggle" aria-expanded={showFilters} aria-controls={filterId} onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={16} aria-hidden />{t("Filters", "عوامل التصفية")}{extraCount > 0 && ` · ${extraCount}`}<ChevronDown size={16} aria-hidden /></button>
        </div>
        <AnimatePresence initial={false}>
          {showFilters && <m.div key="filters" id={filterId} className="history-filter-fields" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            <div className="history-filter-grid">
              <label>{t("From", "من")}<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => update("from", e.target.value)} /></label>
              <label>{t("To", "إلى")}<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => update("to", e.target.value)} /></label>
              <label>{t("Sort by", "الترتيب حسب")}<select aria-label={t("Sort by", "الترتيب حسب")} value={filters.sort} onChange={e => update("sort", e.target.value as HistoryFilters["sort"])}><option value="newest">{t("Newest added", "الأحدث إضافة")}</option><option value="soonest">{t("Appointment: earliest first", "الموعد: الأقرب أولاً")}</option><option value="latest">{t("Appointment: latest first", "الموعد: الأبعد أولاً")}</option></select></label>
            </div>
            <p className="small muted">{t("Dates use Dubai time.", "التواريخ بتوقيت دبي.")}</p>
          </m.div>}
        </AnimatePresence>
      </div>
      <div className="history-results"><p className="small muted" role="status">{loading ? t("Updating requests…", "جارٍ تحديث الطلبات…") : `${rows.length} ${t("shown", "معروضة")}${coordinator && rows.length === 100 ? t(" · First 100 matches; narrow your filters", " · أول ١٠٠ نتيجة؛ حدد عوامل التصفية") : ""}`}</p><div className="history-list-actions">{changed && <button type="button" className="btn small" onClick={() => setFilters(HISTORY_FILTERS)}>{t("Clear filters", "مسح التصفية")}</button>}{!archived && rows.length > 0 && <button type="button" className="btn small" disabled={busy || loading} onClick={() => { setBulk(rows); setError(null); }}><Archive size={16} aria-hidden />{t("Archive all shown", "أرشفة جميع المعروضة")}</button>}</div></div>
      {notice && <p className="history-status" role="status">{notice}</p>}
      {invalidDates && <p className="error" role="alert">{t("The end date must be on or after the start date.", "يجب أن يكون تاريخ النهاية في تاريخ البداية أو بعده.")}</p>}
      {error && <p className="error" role="alert">{error} <button type="button" className="btn small" onClick={() => setRevision(value => value + 1)}>{t("Try again", "حاول مجدداً")}</button></p>}
      {!loading && !error && !invalidDates && rows.length === 0 && <div className="history-empty"><Inbox size={28} aria-hidden /><p className="history-status">{changed ? t("No requests match these filters", "لا توجد طلبات تطابق هذه التصفية") : archived ? t("No archived requests", "لا توجد طلبات مؤرشفة") : t("No current requests", "لا توجد طلبات حالية")}</p></div>}
      <ul className="request-history-list" aria-busy={loading || busy}>
        <AnimatePresence initial={false}>
        {rows.map((row, i) => <m.li key={row.id} layout className={`tone-${TONES[row.status]}`} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(i, 8) * 0.04, type: "spring", stiffness: 260, damping: 26 } }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}>
          {coordinator ? <button type="button" className="history-request" disabled={busy || loading} onClick={() => select(row.id)}><HistoryCopy row={row} lang={lang} showName /><ArrowUpRight size={18} aria-hidden /></button> : <Link className="history-request" href={`/r/${row.token}`} onClick={() => setOpen(false)}><HistoryCopy row={row} lang={lang} /><ArrowUpRight size={18} aria-hidden /></Link>}
          <div className="history-row-actions"><button type="button" className="icon-btn" disabled={busy || loading} title={archived ? t("Restore request", "استعادة الطلب") : t("Archive request", "أرشفة الطلب")} aria-label={t(`${archived ? "Restore" : "Archive"} ${row.appointment.entity}`, `${archived ? "استعادة" : "أرشفة"} ${row.appointment.entity}`)} onClick={() => archive(row)}>{archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}</button>
          {!coordinator && row.token && <button type="button" className="icon-btn" disabled={busy} title={t("Remove from this browser", "حذف من هذا المتصفح")} aria-label={t(`Remove ${row.appointment.entity} from this browser`, `حذف ${row.appointment.entity} من هذا المتصفح`)} onClick={() => remove(row.token!)}><X size={16} aria-hidden /></button>}</div>
        </m.li>)}
        </AnimatePresence>
        {missing.map(token => <li key={token}><Link className="history-request" href={`/r/${token}`} onClick={() => setOpen(false)}><span>{t("Saved request", "طلب محفوظ")}<small>{t("Could not refresh. Open your private link to retry. Status and date filters cannot check this request.", "تعذر التحديث. افتح رابطك الخاص للمحاولة مجدداً. لا يمكن التحقق من حالته أو تاريخه للتصفية.")}</small></span><ArrowUpRight size={18} aria-hidden /></Link><button type="button" className="icon-btn" disabled={busy} aria-label={t("Remove saved link", "حذف الرابط المحفوظ")} onClick={() => remove(token)}><X size={16} aria-hidden /></button></li>)}
      </ul>
      <p className="small muted history-scope"><ShieldCheck size={15} aria-hidden />{coordinator ? t("Archives are shared with coordinators. Archiving does not cancel matching.", "الأرشيف مشترك بين المنسقين. الأرشفة لا تلغي البحث عن مترجم.") : t("Links stay in this browser. Archiving does not cancel a request.", "تبقى الروابط في هذا المتصفح. الأرشفة لا تلغي الطلب.")}</p>
    </Modal>
    <Modal open={bulk !== null} onClose={() => setBulk(null)} title={t(`Archive ${bulk?.length ?? 0} ${bulk?.length === 1 ? "request" : "requests"}?`, `أرشفة الطلبات المعروضة (${bulk?.length ?? 0})؟`)} closeLabel={t("Close archive confirmation", "إغلاق تأكيد الأرشفة")}>
      <p>{t("Only the requests currently shown will move to Archived. Matching and coordinator support continue. You can restore them later.", "ستُنقل الطلبات المعروضة حالياً فقط إلى الأرشيف. يستمر البحث عن مترجم ودعم المنسق. يمكنك استعادتها لاحقاً.")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="history-confirm-actions"><button type="button" className="btn" disabled={busy} onClick={() => setBulk(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn primary" disabled={busy} onClick={archiveAll}>{busy ? t("Archiving…", "جارٍ الأرشفة…") : t("Archive requests", "أرشفة الطلبات")}</button></div>
    </Modal>
  </>;
}

function HistoryCopy({ row, lang, showName = false }: { row: HistoryEntry; lang: "en" | "ar"; showName?: boolean }) {
  const state = STATES[row.status];
  return <span className="history-copy"><small className="history-state">{state[lang === "ar" ? 1 : 0]}</small><strong dir="auto">{showName && row.requester_name ? `${row.requester_name} · ` : ""}{row.appointment.entity}</strong><small className="history-when"><CalendarDays size={14} aria-hidden />{new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(row.appointment.starts_at * 1000)}</small><small className="history-id"><bdi>{row.id}</bdi></small></span>;
}
