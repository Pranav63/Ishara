"use client";

import { MotionConfig } from "motion/react";
import { Contrast, Languages, Settings2, Type } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { Popover } from "@/components/ui";
import { CompanionAvatar } from "@/components/CompanionAvatar";
import { DEFAULTS, parsePrefs, type Prefs } from "@/lib/preferences";

const Context = createContext({ prefs: DEFAULTS, update: (_: Partial<Prefs>) => {} });

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState(DEFAULTS);
  useEffect(() => { try { setPrefs(parsePrefs(localStorage.getItem("ishara.prefs"))); } catch {} }, []);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { root.dataset.theme = prefs.theme === "system" ? (media.matches ? "dark" : "light") : prefs.theme; };
    apply();
    root.lang = prefs.lang;
    root.dir = prefs.lang === "ar" ? "rtl" : "ltr";
    root.classList.toggle("hc", prefs.contrast);
    root.classList.toggle("text-only", prefs.textOnly);
    root.classList.toggle("reduce-motion", prefs.reducedMotion || prefs.textOnly);
    root.dataset.textSize = String(prefs.size);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  function update(patch: Partial<Prefs>) {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try { localStorage.setItem("ishara.prefs", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  return <Context.Provider value={{ prefs, update }}><MotionConfig reducedMotion={prefs.reducedMotion || prefs.textOnly ? "always" : "user"}>{children}</MotionConfig></Context.Provider>;
}

export const usePreferences = () => useContext(Context);
export function useLanguage() {
  const { prefs } = usePreferences();
  return { lang: prefs.lang, isAr: prefs.lang === "ar", t: (en: string, ar: string) => prefs.lang === "ar" ? ar : en };
}

export function DisplaySettings({ inline = false }: { inline?: boolean }) {
  const { prefs, update } = usePreferences();
  const { t } = useLanguage();
  const controls = <div className="display-settings">
    <h2>{t("Make Ishara yours", "إشارة كما تناسبك")}</h2>
    <label htmlFor={inline ? "theme-inline" : "theme-menu"}>{t("Appearance", "المظهر")}</label>
    <select id={inline ? "theme-inline" : "theme-menu"} value={prefs.theme} onChange={(e) => update({ theme: e.target.value as Prefs["theme"] })}>
      <option value="system">{t("Use device setting", "حسب إعدادات الجهاز")}</option><option value="light">{t("Light", "فاتح")}</option><option value="dark">{t("Dark", "داكن")}</option>
    </select>
    <div className="a11y-bar">
      <button className="chip" onClick={() => update({ size: ((prefs.size + 1) % 3) as Prefs["size"] })} aria-label={`${t("Text size", "حجم النص")}: ${[100, 115, 130][prefs.size]}%`}><Type size={17} aria-hidden />{["A", "A+", "A++"][prefs.size]}</button>
      <button className="chip" aria-pressed={prefs.contrast} onClick={() => update({ contrast: !prefs.contrast })}><Contrast size={17} aria-hidden />{t("High contrast", "تباين عالٍ")}</button>
    </div>
    {!prefs.textOnly && <fieldset className="companion-setting"><legend>{t("Companion", "الرفيق")}</legend><div className="companion-choices" role="group" aria-label={t("Companion style", "شكل الرفيق")}>
      {([["falcon", "Falcon", "صقر"], ["fox", "Desert fox", "ثعلب الصحراء"], ["pearl", "Pearl", "لؤلؤة"]] as const).map(([kind, en, ar]) => <button type="button" key={kind} className="companion-choice" aria-pressed={prefs.companion === kind} onClick={() => update({ companion: kind })}><CompanionAvatar kind={kind} /><span>{t(en, ar)}</span></button>)}
    </div></fieldset>}
    <label className="setting-check"><input type="checkbox" checked={prefs.textOnly} onChange={(e) => update({ textOnly: e.target.checked })} />{t("Text-first mode", "وضع النص أولاً")}</label>
    <p className="small muted">{t("Keeps every update in text. Hides animation and video, with no flashing or vibration.", "يُبقي جميع التحديثات نصية ويخفي الحركة والفيديو، دون وميض أو اهتزاز.")}</p>
    <label className="setting-check"><input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />{t("Reduce motion", "تقليل الحركة")}</label>
    <label className="setting-check"><input type="checkbox" checked={prefs.alerts} disabled={prefs.textOnly} onChange={(e) => update({ alerts: e.target.checked })} />{t("Visual and vibration alerts", "تنبيهات مرئية واهتزازية")}</label>
  </div>;
  return <div className="display-controls">
    <button className="btn small language-toggle" onClick={() => update({ lang: prefs.lang === "en" ? "ar" : "en" })} lang={prefs.lang === "en" ? "ar" : "en"}><Languages size={17} aria-hidden />{prefs.lang === "en" ? "العربية" : "English"}</button>
    {inline ? <details className="display-details"><summary>{t("Display & accessibility", "العرض وإمكانية الوصول")}</summary>{controls}</details> : <Popover label={t("Display & accessibility", "العرض وإمكانية الوصول")} align="end" trigger={<span className="icon-btn as-span"><Settings2 size={20} aria-hidden /></span>}>{controls}</Popover>}
  </div>;
}
