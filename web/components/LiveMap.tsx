"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/Preferences";
import { areaName } from "@/lib/locale";
import { DubaiMap } from "@/components/DubaiMap";
import { initials } from "@/lib/format";
import { stateOf } from "@/lib/state";
import type { Interp, Snapshot } from "@/lib/types";

// Free vector basemap, no key or account. Override with NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron";
const DUBAI: [number, number] = [55.27, 25.18];

type Places = Record<string, [number, number]>;
type LngLat = [number, number];
type Padding = { top: number; right: number; bottom: number; left: number };

const toLL = ([lat, lon]: [number, number]): LngLat => [lon, lat];
const reduced = () => typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion"));

function curve(a: LngLat, b: LngLat, t: number): LngLat[] {
  const c: LngLat = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.22, (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.22];
  const pts: LngLat[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * t;
    pts.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]);
  }
  return pts;
}

export function LiveMap({ places, interpreters, snap, now, padding }: { places: Places; interpreters: Interp[]; snap: Snapshot | null; now: number; padding: Padding }) {
  const { t, lang } = useLanguage();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pins = useRef(new Map<string, { m: Marker; el: HTMLElement }>());
  const venuePin = useRef<{ m: Marker; el: HTMLElement } | null>(null);
  const drawn = useRef(new Map<string, number>());
  const fitKey = useRef("");
  const raf = useRef(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Init once. Fall back to the offline SVG map if WebGL or the tile server is unavailable.
  useEffect(() => {
    if (failed) return;
    let dead = false;
    let loaded = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (dead || !box.current) return;
        ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        const m = new ml.Map({ container: box.current, style: STYLE, center: DUBAI, zoom: 10.4, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
        map.current = m;
        m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        timer = setTimeout(() => !m.loaded() && setFailed(true), 12000);
        m.on("error", (e) => { if (!dead && !loaded) setFailed(true); console.warn("map", e.error?.message); });
        m.on("load", () => {
          loaded = true;
          clearTimeout(timer);
          for (const l of m.getStyle().layers ?? []) {
            if (l.type === "background") m.setPaintProperty(l.id, "background-color", "#faf8f5");
            if (l.type === "fill") m.setPaintProperty(l.id, "fill-color", /water/.test(l.id) ? "#ddd9d3" : "#eee7de");
          }
          m.addSource("arcs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "arc-halo", type: "line", source: "arcs", filter: ["!=", ["get", "state"], "standby"], layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": ["match", ["get", "state"], "accepted", 9, 7], "line-opacity": 0.9 } });
          m.addLayer({ id: "arc", type: "line", source: "arcs", filter: ["!=", ["get", "state"], "standby"], layout: { "line-cap": "round" }, paint: { "line-color": ["match", ["get", "state"], "accepted", "#8b4d35", "#d9930d"], "line-width": ["match", ["get", "state"], "accepted", 4.5, 3] } });
          m.addLayer({ id: "arc-backup", type: "line", source: "arcs", filter: ["==", ["get", "state"], "standby"], layout: { "line-cap": "round" }, paint: { "line-color": "#8b4d35", "line-width": 2.5, "line-dasharray": [0.5, 2.5], "line-opacity": 0.75 } });
          setReady(true);
        });
      } catch (err) {
        console.warn("map unavailable", err);
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf.current);
      map.current?.remove();
      map.current = null;
    };
  }, [failed]);

  // Sync markers and arcs with the dispatch snapshot.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (async () => {
      const ml = await import("maplibre-gl");
      const offers = snap?.offers ?? [];
      const venue = snap && places[snap.appointment.area] ? toLL(places[snap.appointment.area]) : null;

      // Venue
      if (venue && snap) {
        if (!venuePin.current) {
          const el = document.createElement("div");
          el.className = "venue";
          el.innerHTML = '<span class="venue-dot"></span><span class="venue-label"></span>';
          venuePin.current = { el, m: new ml.Marker({ element: el, anchor: "center" }).setLngLat(venue).addTo(m) };
        }
        venuePin.current.m.setLngLat(venue);
        (venuePin.current.el.querySelector(".venue-label") as HTMLElement).textContent = snap.appointment.entity;
        venuePin.current.el.classList.toggle("done", snap.status === "confirmed" || snap.status === "completed");
      } else if (venuePin.current) {
        venuePin.current.m.remove();
        venuePin.current = null;
      }

      // Interpreters; nudge anyone sharing the venue's district so pins never stack.
      const arcs: { key: string; from: LngLat; state: string }[] = [];
      const active: LngLat[] = venue ? [venue] : [];
      for (const it of interpreters) {
        const g = places[it.area];
        if (!g) continue;
        let p = toLL(g);
        if (venue && Math.hypot(p[0] - venue[0], p[1] - venue[1]) < 0.012) p = [venue[0] - 0.014, venue[1] + 0.01];
        const { state, offer } = stateOf(it.id, offers);
        let pin = pins.current.get(it.id);
        if (!pin) {
          const el = document.createElement("div");
          el.className = "mk";
          el.innerHTML = '<span class="mk-dot"></span><span class="mk-label"></span>';
          el.setAttribute("role", "img");
          pin = { el, m: new ml.Marker({ element: el, anchor: "center" }).setLngLat(p).addTo(m) };
          pins.current.set(it.id, pin);
        }
        pin.m.setLngLat(p);
        pin.el.dataset.state = state;
        pin.el.dataset.quiet = snap ? "0" : "1";
        (pin.el.querySelector(".mk-dot") as HTMLElement).textContent = initials(it.name);
        const suffix = state === "standby" ? t(", backup", "، احتياطي") : (state === "pending" || state === "accepted") && offer ? t(`, ${offer.travel_min} min away`, `، على بعد ${offer.travel_min} دقيقة`) : state === "out" ? `, ${offer?.status}` : "";
        (pin.el.querySelector(".mk-label") as HTMLElement).textContent = it.name + suffix;
        pin.el.setAttribute("aria-label", `${it.name}, ${areaName(it.area, lang)}${suffix}`);
        const frac = state === "pending" && offer ? Math.max(0, Math.min(1, (offer.expires_at - now) / Math.max(1, offer.expires_at - offer.sent_at))) : 0;
        pin.el.style.setProperty("--p", String(frac));
        if (venue && offer && (state === "pending" || state === "accepted" || state === "standby")) {
          arcs.push({ key: `${it.id}-${offer.id}-${state}`, from: p, state });
          active.push(p);
        }
      }

      // Draw arcs, animating any that are new.
      const src = m.getSource("arcs") as GeoJSONSource | undefined;
      const t0 = performance.now();
      for (const a of arcs) if (!drawn.current.has(a.key)) drawn.current.set(a.key, reduced() ? 0 : t0);
      const frame = () => {
        const t = performance.now();
        let moving = false;
        const features = arcs.map((a) => {
          const start = drawn.current.get(a.key) ?? 0;
          const raw = start ? Math.min(1, (t - start) / 800) : 1;
          if (raw < 1) moving = true;
          const e = 1 - Math.pow(1 - raw, 3);
          return { type: "Feature" as const, properties: { state: a.state }, geometry: { type: "LineString" as const, coordinates: curve(a.from, venue!, Math.max(0.02, e)) } };
        });
        src?.setData({ type: "FeatureCollection", features });
        if (moving) raf.current = requestAnimationFrame(frame);
      };
      cancelAnimationFrame(raf.current);
      frame();

      // Re-frame the camera when the cast changes, not on every tick.
      const key = `${snap?.id ?? "none"}|${arcs.map((a) => a.key.split("-")[0]).sort().join(",")}`;
      if (key !== fitKey.current) {
        fitKey.current = key;
        const pts = active.length > 1 ? active : interpreters.map((i) => places[i.area]).filter(Boolean).map(toLL);
        if (pts.length) {
          const b = new ml.LngLatBounds(pts[0], pts[0]);
          pts.forEach((p) => b.extend(p));
          m.fitBounds(b, { padding, maxZoom: 13, duration: reduced() ? 0 : 1400, essential: false });
        }
      }
    })();
  }, [snap, interpreters, places, ready, now, padding, lang]);

  if (failed) return <div className="map-full"><DubaiMap places={places} interpreters={interpreters} snap={snap} now={now} /></div>;
  // Inline position wins over maplibre-gl.css, which would otherwise collapse the container to zero height.
  return <div ref={box} className="map-full" style={{ position: "absolute", inset: 0 }} role="region" aria-busy={!ready} aria-label={t("Map of Dubai with interpreters and the appointment", "خريطة دبي مع المترجمين والموعد")} />;
}
