"use client";

import { Hand } from "lucide-react";
import { useEffect, useState } from "react";
import Orb from "@/components/Orb";
import { usePreferences } from "@/components/Preferences";

// Ishara's agent on the home screen (React Bits Orb). It wakes while the resident writes.
export function HeroOrb({ awake }: { awake: boolean }) {
  const { prefs } = usePreferences();
  const [bg, setBg] = useState<string | null>(null);
  // The orb blends into the page, so it follows the theme's background.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setBg(getComputedStyle(root).getPropertyValue("--bg").trim());
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);
  if (prefs.textOnly) return null;
  return <div className={`hero-orb${awake ? " awake" : ""}`} aria-hidden>
    {bg && <Orb colors={["#3d8bff", "#2ec5d3", "#0a3a9e"]} backgroundColor={bg} size={0.8} forceHoverState={awake} speed={awake ? 1.3 : 0.55} hoverIntensity={0.7} paused={prefs.reducedMotion} dpr={1.5} />}
    <span className="hero-orb-mark"><Hand strokeWidth={1.8} /></span>
  </div>;
}
