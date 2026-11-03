import type { Offer, Status } from "./types";

export type PinState = "idle" | "pending" | "accepted" | "standby" | "out";

export function stateOf(id: string, offers: Offer[]): { state: PinState; offer?: Offer } {
  const o = offers.filter((x) => x.interpreter_id === id).pop();
  if (!o) return { state: "idle" };
  if (o.status === "pending" || o.status === "accepted" || o.status === "standby") return { state: o.status, offer: o };
  return { state: "out", offer: o };
}

// Header progress: which of the four steps is current
export function stepOf(status?: Status): number {
  if (!status) return -1;
  return { parsing: 0, reviewing: 0, dispatching: 1, replanning: 1, escalated: 1, confirmed: 2, completed: 3 }[status];
}
