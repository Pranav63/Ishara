"use client";

import { motion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@/components/Preferences";

const TARGETS = ".btn, .chip, .sample, .icon-btn, .pop-trigger, .prep-action, .composer-example, .workspace-switch button, .history-views button, .history-request, .request-retry";
// Position settles faster than size, so the drop stretches as it travels and rounds off when it lands.
const MOVE = { stiffness: 210, damping: 24, mass: 0.9 };
const SHAPE = { stiffness: 130, damping: 19, mass: 1 };

// One glass droplet that flows from control to control as the pointer moves across the app.
export function LiquidCursor() {
  const { prefs } = usePreferences();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const [pressed, setPressed] = useState(false);
  const target = useRef<HTMLElement | null>(null);
  const x = useSpring(0, MOVE), y = useSpring(0, MOVE), w = useSpring(0, SHAPE), h = useSpring(0, SHAPE), r = useSpring(999, SHAPE);
  const off = prefs.reducedMotion || prefs.textOnly;

  useEffect(() => {
    if (off || !matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const place = (el: HTMLElement, snap: boolean) => {
      const box = el.closest("dialog[open]") as HTMLElement | null;
      const b = el.getBoundingClientRect(), o = box?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const values: [typeof x, number][] = [[x, b.left - o.left], [y, b.top - o.top], [w, b.width], [h, b.height], [r, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12]];
      for (const [value, to] of values) snap ? value.jump(to) : value.set(to);
      setHost(box ?? document.body);
    };
    const enter = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(TARGETS) as HTMLElement | null;
      if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
      const jumpHost = !target.current || target.current.closest("dialog[open]") !== el.closest("dialog[open]");
      target.current = el;
      place(el, jumpHost);
      setShown(true);
    };
    const leave = (e: PointerEvent) => {
      const next = (e.relatedTarget as Element | null)?.closest?.(TARGETS);
      if (!next) { target.current = null; setShown(false); }
    };
    const follow = () => { if (target.current?.isConnected) place(target.current, true); else { target.current = null; setShown(false); } };
    const down = () => setPressed(true), up = () => setPressed(false);
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [off, x, y, w, h, r]);

  if (off || !host) return null;
  return createPortal(<motion.span aria-hidden className={`liquid-drop${host === document.body ? "" : " in-dialog"}`}
    style={{ x, y, width: w, height: h, borderRadius: r }}
    animate={{ opacity: shown ? 1 : 0, scale: pressed && shown ? 0.92 : 1 }}
    transition={{ opacity: { duration: 0.35 }, scale: { type: "spring", stiffness: 380, damping: 14 } }} />, host);
}
