"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "./api";

// Streams contain only scoped change notifications; snapshots remain behind their access checks.
export function useLive<T>(load: () => Promise<T>, options: { requesterToken?: string; interpreterToken?: string; enabled?: boolean; stream?: boolean } = {}) {
  const { requesterToken, interpreterToken, enabled = true, stream: streamEnabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const generation = useRef(0);
  const request = useRef(0);
  const active = useRef(false);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const scope = generation.current;
    const sequence = ++request.current;
    const current = () => active.current && scope === generation.current && sequence === request.current;
    try {
      const value = await loadRef.current();
      if (current()) { setData(value); setError(null); }
    } catch (e) { if (current()) setError((e as Error).message); }
  }, []);
  useEffect(() => {
    generation.current++;
    active.current = enabled;
    setData(null); setError(null);
    if (!enabled) return;
    refresh();
    let timer: ReturnType<typeof setTimeout>;
    const scope = requesterToken ? `?requester_token=${encodeURIComponent(requesterToken)}` : interpreterToken ? `?interpreter_token=${encodeURIComponent(interpreterToken)}` : "";
    const stream = streamEnabled ? new EventSource(API + "/api/stream" + scope, { withCredentials: true }) : null;
    if (stream) stream.onmessage = () => { clearTimeout(timer); timer = setTimeout(refresh, 60); };
    const poll = setInterval(refresh, 4000);
    return () => { active.current = false; generation.current++; stream?.close(); clearInterval(poll); clearTimeout(timer); };
  }, [refresh, enabled, requesterToken, interpreterToken, streamEnabled]);
  return { data, error, refresh };
}

// Server-aligned clock in epoch seconds, so countdowns match the backend.
export function useNow(serverNow?: number) {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { if (serverNow) offset.current = serverNow - Date.now() / 1000; }, [serverNow]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000 + offset.current), 250); return () => clearInterval(id); }, []);
  return now;
}
