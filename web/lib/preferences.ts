export type Lang = "en" | "ar";
export type Prefs = { size: 0 | 1 | 2; contrast: boolean; alerts: boolean; lang: Lang; textOnly: boolean; theme: "light" | "dark" | "system"; reducedMotion: boolean };
export const DEFAULTS: Prefs = { size: 0, contrast: false, alerts: false, lang: "en", textOnly: false, theme: "system", reducedMotion: false };

export function parsePrefs(raw: string | null): Prefs {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return DEFAULTS;
    return {
      size: [0, 1, 2].includes(value.size) ? value.size : 0,
      lang: value.lang === "ar" ? "ar" : "en",
      theme: ["light", "dark", "system"].includes(value.theme) ? value.theme : "system",
      contrast: value.contrast === true, alerts: value.alerts === true,
      textOnly: value.textOnly === true, reducedMotion: value.reducedMotion === true,
    };
  } catch { return DEFAULTS; }
}
