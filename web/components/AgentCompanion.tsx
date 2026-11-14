"use client";

import { Hand } from "lucide-react";
import { usePreferences } from "@/components/Preferences";
import type { Status } from "@/lib/types";

// The agent's single visual identity: the Ishara mark in a gradient that shows what the agent is doing.
export function AgentOrb({ state }: { state: string }) {
  return <span className="agent-orb" data-state={state} aria-hidden><Hand strokeWidth={2.2} /></span>;
}

export function AgentCompanion({ status, busy = false }: { status?: Status; busy?: boolean }) {
  const { prefs } = usePreferences();
  return prefs.textOnly ? null : <AgentOrb state={busy ? "parsing" : status ?? "idle"} />;
}
