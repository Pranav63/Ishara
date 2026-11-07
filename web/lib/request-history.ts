const KEY = "ishara.requests";

export function requestTokens(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((token): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token)))].slice(0, 100) : [];
  } catch { return []; }
}

export function rememberRequest(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify([token, ...requestTokens().filter(value => value !== token)].slice(0, 100))); return true; } catch { return false; }
}

export function forgetRequest(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify(requestTokens().filter(value => value !== token))); return true; } catch { return false; }
}
