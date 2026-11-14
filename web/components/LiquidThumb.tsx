"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePreferences } from "@/components/Preferences";

// The leading edge springs ahead and the trailing edge lags behind, so the selection
// stretches out of one tab like a drop of water and pulls itself together on the next.
const LEAD = { type: "spring", stiffness: 70, damping: 15, mass: 1 } as const;
const TRAIL = { type: "spring", stiffness: 26, damping: 9, mass: 1.2 } as const;

export function LiquidThumb({ group, index }: { group: React.RefObject<HTMLElement | null>; index: number }) {
  const { prefs } = usePreferences();
  const still = prefs.reducedMotion || prefs.textOnly;
  const left = useMotionValue(0), right = useMotionValue(0), top = useMotionValue(0), height = useMotionValue(0);
  const rest = useRef(0);
  const placed = useRef(false);
  const width = useTransform(() => Math.max(0, right.get() - left.get()));
  // A stretched drop gets thinner, then settles back to full height.
  const scaleY = useTransform(() => { const w = right.get() - left.get(); return rest.current && w > rest.current ? Math.max(0.72, Math.sqrt(rest.current / w)) : 1; });

  const at = useRef(index);
  const measure = (snap: boolean) => {
    const tab = group.current?.querySelectorAll<HTMLElement>(":scope > button")[at.current];
    if (!tab || !tab.offsetWidth) return;
    const to = [tab.offsetLeft, tab.offsetLeft + tab.offsetWidth];
    rest.current = tab.offsetWidth;
    top.set(tab.offsetTop); height.set(tab.offsetHeight);
    if (snap || still || !placed.current || matchMedia("(prefers-reduced-motion: reduce)").matches) { left.set(to[0]); right.set(to[1]); placed.current = true; return; }
    const forward = to[0] > left.get();
    animate(left, to[0], forward ? TRAIL : LEAD);
    animate(right, to[1], forward ? LEAD : TRAIL);
  };
  const latest = useRef(measure);
  latest.current = measure;
  // Selection changed: flow to the new tab.
  useLayoutEffect(() => { at.current = index; latest.current(false); }, [index]);
  // Layout changed (dialog opened, window resized): follow without animating.
  // A passive effect, because the parent's ref is attached after this child's layout effects run.
  useEffect(() => {
    const el = group.current;
    if (!el) return;
    const observer = new ResizeObserver(() => latest.current(true));
    observer.observe(el);
    return () => observer.disconnect();
  }, [group]);

  return <motion.span aria-hidden className="liquid-thumb" style={{ x: left, y: top, width, height, scaleY }} />;
}
