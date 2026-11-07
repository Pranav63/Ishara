import type { Snapshot, Status } from "./types";

const KEY = "ishara.requests";
const ARCHIVED = "ishara.requests.archived";
export type HistoryEntry = Pick<Snapshot, "id" | "created_at" | "status" | "requester_name" | "appointment"> & { token?: string };
export type HistoryFilters = { query: string; status: Status | ""; from: string; to: string; sort: "newest" | "soonest" | "latest" };
export const HISTORY_FILTERS: HistoryFilters = { query: "", status: "", from: "", to: "", sort: "newest" };

function savedTokens(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((token): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token)))].slice(0, 100) : [];
  } catch { return []; }
}

export const requestTokens = () => savedTokens(KEY);
export const archivedRequestTokens = () => savedTokens(ARCHIVED);

export function archiveRequest(token: string, archived: boolean) {
  try {
    const saved = requestTokens();
    const tokens = archivedRequestTokens().filter(value => value !== token && saved.includes(value));
    localStorage.setItem(ARCHIVED, JSON.stringify(archived ? [token, ...tokens].slice(0, 100) : tokens));
    return true;
  } catch { return false; }
}

export function filterHistory<T extends HistoryEntry>(entries: T[], filters: HistoryFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries.filter(row => {
    const day = new Date((row.appointment.starts_at + 4 * 3600) * 1000).toISOString().slice(0, 10);
    return (!query || `${row.id} ${row.requester_name} ${row.appointment.entity} ${row.appointment.area}`.toLocaleLowerCase().includes(query))
      && (!filters.status || row.status === filters.status) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }).sort((a, b) => filters.sort === "newest" ? b.created_at - a.created_at : filters.sort === "soonest" ? a.appointment.starts_at - b.appointment.starts_at : b.appointment.starts_at - a.appointment.starts_at);
}

export function rememberRequest(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify([token, ...requestTokens().filter(value => value !== token)].slice(0, 100))); return true; } catch { return false; }
}

export function forgetRequest(token: string) {
  try {
    localStorage.setItem(ARCHIVED, JSON.stringify(archivedRequestTokens().filter(value => value !== token)));
    localStorage.setItem(KEY, JSON.stringify(requestTokens().filter(value => value !== token)));
    return true;
  } catch { return false; }
}
