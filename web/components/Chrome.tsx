"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { api } from "@/lib/api";

export function Connection({ online }: { online: boolean }) {
  const { t } = useLanguage();
  return <span className={`conn${online ? "" : " off"}`} role="status"><i aria-hidden />{online ? t("Connected", "متصل") : t("Service unavailable", "الخدمة غير متاحة")}</span>;
}

export function ResetButton({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => details.current?.removeAttribute("open");
  return <details ref={details} className="workspace-reset"><summary><RotateCcw size={18} aria-hidden />{t("Reset demo", "إعادة تعيين العرض")}</summary><div className="confirm"><strong>{t("Clear all demo requests?", "حذف جميع الطلبات التجريبية؟")}</strong><p>{t("Interpreters stay. The map and activity start fresh.", "يبقى المترجمون. تبدأ الخريطة وسجل النشاط من جديد.")}</p><div className="row"><button className="btn small" onClick={close}>{t("Keep", "إبقاء")}</button><button className="btn small danger" onClick={async () => { try { await api.reset(); onDone(); close(); } catch (e) { setError((e as Error).message); } }}>{t("Reset", "إعادة تعيين")}</button></div>{error && <p className="error" role="alert">{error}</p>}</div></details>;
}

export function OfflineBanner({ online }: { online: boolean }) {
  const { t } = useLanguage();
  if (online) return null;
  return <div className="banner glass" role="alert">{t("The interpreter service is unavailable right now. New requests cannot be confirmed and existing details may be out of date.", "خدمة المترجمين غير متاحة حالياً. لا يمكن تأكيد طلبات جديدة وقد تكون التفاصيل الحالية قديمة.")}</div>;
}

export function useMapPadding(drawer: boolean, stage = false) {
  const [w, setW] = useState(1440);
  const { isAr } = useLanguage();
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return useMemo(() => {
    if (w < 900) return { top: 90, left: 30, right: 30, bottom: 40 };
    const side = drawer ? 420 : 90;
    return { top: 120, left: isAr ? side : 440, right: isAr ? 440 : side, bottom: stage ? 260 : 230 };
  }, [w, drawer, stage, isAr]);
}
