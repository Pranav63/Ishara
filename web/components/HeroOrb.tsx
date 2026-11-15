"use client";

import { animate, m, useMotionValue, useSpring, useTransform } from "motion/react";
import { Hand } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Orb from "@/components/Orb";
import { usePreferences } from "@/components/Preferences";

const FLOAT = { stiffness: 90, damping: 14, mass: 0.8 };
const WAVE = [0, -22, 18, -14, 10, -4, 0];

// Ishara's agent on the home screen (React Bits Orb). It leans toward the pointer,
// waves when tapped, and wakes while the resident writes.
export function HeroOrb({ awake }: { awake: boolean }) {
  const { prefs } = usePreferences();
  const still = prefs.reducedMotion;
  const ref = useRef<HTMLDivElement>(null);
  const [bg, setBg] = useState<string | null>(null);
  const px = useMotionValue(0), py = useMotionValue(0), wave = useMotionValue(0);
  const x = useSpring(useTransform(px, [-1, 1], [-16, 16]), FLOAT);
  const y = useSpring(useTransform(py, [-1, 1], [-12, 12]), FLOAT);
  const rotateX = useSpring(useTransform(py, [-1, 1], [16, -16]), FLOAT);
  const rotateY = useSpring(useTransform(px, [-1, 1], [-16, 16]), FLOAT);
  // The hand sits nearer the viewer than the ring, so it drifts further.
  const handX = useTransform(x, v => v * 0.8), handY = useTransform(y, v => v * 0.8);

  // The orb blends into the page, so it follows the theme's background.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setBg(getComputedStyle(root).getPropertyValue("--bg").trim());
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (still || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const follow = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      px.set(clamp((e.clientX - r.left - r.width / 2) / (innerWidth / 2)));
      py.set(clamp((e.clientY - r.top - r.height / 2) / (innerHeight / 2)));
    };
    const rest = () => { px.set(0); py.set(0); };
    window.addEventListener("pointermove", follow, { passive: true });
    document.documentElement.addEventListener("pointerleave", rest);
    return () => { window.removeEventListener("pointermove", follow); document.documentElement.removeEventListener("pointerleave", rest); };
  }, [still, px, py]);

  const hello = () => { if (!still) animate(wave, WAVE, { duration: 1, ease: "easeInOut" }); };
  // Say hello when the resident starts writing.
  useEffect(() => { if (awake && !still) animate(wave, WAVE, { duration: 1, ease: "easeInOut" }); }, [awake, still, wave]);

  if (prefs.textOnly) return null;
  return <m.div ref={ref} className={`hero-orb${awake ? " awake" : ""}`} aria-hidden onPointerDown={hello}
    style={still ? undefined : { x, y, rotateX, rotateY, transformPerspective: 700 }}>
    {bg && <Orb colors={["#3d8bff", "#2ec5d3", "#0a3a9e"]} backgroundColor={bg} size={0.8} forceHoverState={awake} speed={awake ? 1.6 : 0.7} hoverIntensity={1.5} wobble={1.6} trail={1.5} glow={1.2} paused={still} dpr={1.5} />}
    <m.span className="hero-orb-mark" style={still ? undefined : { x: handX, y: handY }}><m.span className="hero-orb-hand" style={{ rotate: wave }}><Hand strokeWidth={1.8} /></m.span></m.span>
  </m.div>;
}
