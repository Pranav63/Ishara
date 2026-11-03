"use client";

import { AnimatePresence, m } from "motion/react";
import { initials } from "@/lib/format";
import type { Interp, Offer, Snapshot } from "@/lib/types";

type Places = Record<string, [number, number]>;
type Pt = [number, number];

// Equirectangular crop of central Dubai; good enough at city scale.
const LON0 = 55.1, LON1 = 55.47, LAT0 = 25.045, LAT1 = 25.305, W = 1000, H = 774;
const px = ([lat, lon]: Pt): Pt => [((lon - LON0) / (LON1 - LON0)) * W, ((LAT1 - lat) / (LAT1 - LAT0)) * H];

const COAST: Pt[] = [
  [25.035, 55.08], [25.07, 55.125], [25.09, 55.14], [25.115, 55.17], [25.14, 55.195], [25.17, 55.22],
  [25.2, 55.245], [25.225, 55.26], [25.245, 55.275], [25.262, 55.29], [25.275, 55.3], [25.29, 55.32],
  [25.3, 55.345], [25.32, 55.37],
];
const CREEK: Pt[] = [[25.268, 55.296], [25.255, 55.305], [25.24, 55.316], [25.225, 55.33], [25.21, 55.343], [25.198, 55.35]];
const LANDMARKS = ["Dubai Marina", "Al Barsha", "Al Quoz", "Downtown", "Business Bay", "Deira", "Mirdif", "Dubai Silicon Oasis", "Al Qusais", "Jumeirah", "Karama"];

const line = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${px(p)[0].toFixed(1)},${px(p)[1].toFixed(1)}`).join(" ");
const WATER = `M0,0 ${line(COAST).replace(/^M/, "L")} L${W},0 Z`;

type State = "idle" | "pending" | "accepted" | "standby" | "out";
const STROKE: Record<State, string> = { idle: "#9aa3a9", pending: "#d9930d", accepted: "#0e7c66", standby: "#0e7c66", out: "#c2413a" };

function stateOf(id: string, offers: Offer[]): { state: State; offer?: Offer } {
  const o = offers.filter((x) => x.interpreter_id === id).pop();
  if (!o) return { state: "idle" };
  if (o.status === "pending" || o.status === "accepted" || o.status === "standby") return { state: o.status, offer: o };
  return { state: "out", offer: o };
}

function arc(a: Pt, b: Pt) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c: Pt = [mx - dy * 0.2, my + dx * 0.2];
  return { d: `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}` };
}

export function DubaiMap({ places, interpreters, snap, now }: { places: Places; interpreters: Interp[]; snap: Snapshot | null; now: number }) {
  const venueArea = snap?.appointment.area;
  const venue = venueArea && places[venueArea] ? px(places[venueArea]) : null;
  const offers = snap?.offers ?? [];
  const confirmed = snap?.status === "confirmed" || snap?.status === "completed";

  // Keep interpreter pins clear of the venue pin when they share a district.
  const pos = (it: Interp): Pt | null => {
    const g = places[it.area];
    if (!g) return null;
    const p = px(g);
    if (!venue) return p;
    const dx = p[0] - venue[0], dy = p[1] - venue[1], dist = Math.hypot(dx, dy);
    if (dist >= 64) return p;
    const ux = dist ? dx / dist : -0.7, uy = dist ? dy / dist : -0.7;
    return [venue[0] + ux * 68, venue[1] + uy * 68];
  };

  const taken: Pt[] = [...interpreters.map(pos).filter((p): p is Pt => !!p), ...(venue ? [venue] : [])];

  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of Dubai showing interpreters and the appointment">
      <path d={WATER} fill="#cbe0e6" />
      <path d={line(COAST)} fill="none" stroke="#b6d0d7" strokeWidth={2} />
      <path d={line(CREEK)} fill="none" stroke="#cbe0e6" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      <text x={70} y={420} fontSize={18} fontStyle="italic" fill="#5f8792" letterSpacing="0.04em">Arabian Gulf</text>

      {LANDMARKS.filter((n) => places[n] && !taken.some(([x, y]) => Math.hypot(x - px(places[n])[0], y - px(places[n])[1]) < 70)).map((n) => {
        const [x, y] = px(places[n]);
        return (
          <g key={n} aria-hidden>
            <circle cx={x} cy={y} r={3} fill="#a9b1ab" />
            <text x={x + 9} y={y + 6} fontSize={17} fill="#7d878a">{n}</text>
          </g>
        );
      })}

      <AnimatePresence>
        {venue &&
          interpreters.map((it) => {
            const p = pos(it);
            const { state, offer } = stateOf(it.id, offers);
            if (!p || !offer || state === "out" || state === "idle") return null;
            const { d } = arc(p, venue);
            return (
              <m.g key={`${it.id}-${offer.id}-${state}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
                <m.path
                  d={d}
                  fill="none"
                  stroke={STROKE[state]}
                  strokeWidth={state === "accepted" ? 4 : state === "standby" ? 2 : 2.5}
                  strokeLinecap="round"
                  strokeDasharray={state === "standby" ? "2 8" : undefined}
                  opacity={state === "standby" ? 0.7 : 1}
                  initial={state === "standby" ? false : { pathLength: 0 }}
                  animate={state === "standby" ? undefined : { pathLength: 1 }}
                  transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                />
              </m.g>
            );
          })}
      </AnimatePresence>

      {interpreters.map((it) => {
        const p = pos(it);
        if (!p) return null;
        const { state, offer } = stateOf(it.id, offers);
        const frac = state === "pending" && offer ? Math.max(0, Math.min(1, (offer.expires_at - now) / Math.max(1, offer.expires_at - offer.sent_at))) : 0;
        const dim = state === "out" || (!!snap && state === "idle");
        return (
          <g key={it.id} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 0.4s" }}>
            {state === "pending" && (
              <circle cx={p[0]} cy={p[1]} r={33} fill="none" stroke="#d9930d" strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - frac} transform={`rotate(-90 ${p[0]} ${p[1]})`} />
            )}
            <m.circle
              className="pin"
              cx={p[0]} cy={p[1]} r={26}
              fill={state === "accepted" ? "#0e7c66" : "#fff"}
              stroke={state === "idle" ? "#c3cac6" : STROKE[state]}
              strokeWidth={state === "idle" ? 1.5 : 2.5}
              strokeDasharray={state === "standby" ? "3 3" : undefined}
              animate={{ scale: state === "accepted" ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            />
            <text x={p[0]} y={p[1] + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={state === "accepted" ? "#fff" : "#17202a"}>{initials(it.name)}</text>
            <text x={p[0] > W - 260 ? p[0] - 36 : p[0] + 36} textAnchor={p[0] > W - 260 ? "end" : "start"} y={p[1] + 7} fontSize={19} fontWeight={600} fill="#17202a" stroke="#e7eae3" strokeWidth={4} paintOrder="stroke">
              {it.name}
              {state === "standby" ? ", backup" : (state === "pending" || state === "accepted") && offer ? `, ${offer.travel_min} min away` : state === "out" ? (offer?.status === "cancelled" ? ", cancelled" : offer?.status === "declined" ? ", declined" : "") : ""}
            </text>
          </g>
        );
      })}

      {venue && snap && (
        <g>
          {confirmed && (
            <m.circle key={`ripple-${snap.assigned?.id}`} cx={venue[0]} cy={venue[1]} r={12} fill="none" stroke="#0e7c66" strokeWidth={2} initial={{ r: 12, opacity: 0.8 }} animate={{ r: 70, opacity: 0 }} transition={{ duration: 1.2, ease: "easeOut" }} />
          )}
          <circle cx={venue[0]} cy={venue[1]} r={14} fill="#17202a" />
          <circle cx={venue[0]} cy={venue[1]} r={5} fill="#fff" />
          <text x={venue[0]} y={venue[1] + 44} textAnchor="middle" fontSize={20} fontWeight={700} fill="#17202a" stroke="#e7eae3" strokeWidth={5} paintOrder="stroke">{snap.appointment.entity}</text>
        </g>
      )}
    </svg>
  );
}
