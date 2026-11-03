"use client";

import { AnimatePresence, m } from "motion/react";
import { Info } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Icon button with a visible tooltip on hover and keyboard focus.
export function IconButton({ label, onClick, children, badge, pressed, tone }: { label: string; onClick?: () => void; children: React.ReactNode; badge?: number; pressed?: boolean; tone?: "primary" }) {
  return (
    <button type="button" className={`icon-btn${tone ? " " + tone : ""}`} aria-label={label} aria-pressed={pressed} data-tip={label} onClick={onClick}>
      {children}
      {!!badge && <span className="badge num" aria-hidden>{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
}

// Small popover anchored to its trigger. Closes on Escape or an outside click.
export function Popover({ trigger, label, children, align = "start", wide }: { trigger: React.ReactNode; label: string; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: "start" | "end"; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = panel;
    if (!open || !element) return;
    const fit = () => {
      element.style.removeProperty("left");
      element.style.removeProperty("right");
      const bounds = element.getBoundingClientRect();
      const shift = bounds.left < 12 ? 12 - bounds.left : bounds.right > window.innerWidth - 12 ? window.innerWidth - 12 - bounds.right : 0;
      element.style.left = `${element.offsetLeft + shift}px`;
      element.style.right = "auto";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [open, panel]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [open]);
  return (
    <span className="pop-anchor" ref={ref}>
      <button type="button" className="pop-trigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <m.div ref={setPanel} id={id} role="dialog" aria-label={label} className={`popover glass ${align}${wide ? " wide" : ""}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 500, damping: 34 }}>
            {typeof children === "function" ? children(() => setOpen(false)) : children}
            <PopoverClose onClose={() => setOpen(false)} />
          </m.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function PopoverClose({ onClose }: { onClose: () => void }) {
  return <button type="button" className="sr-only" onClick={onClose}>Close / إغلاق</button>;
}

// Inline explanation behind a small (i).
export function InfoTip({ label, children, align }: { label: string; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <Popover label={label} align={align} trigger={<Info size={15} strokeWidth={2.2} aria-hidden />}>
      <div className="tip-body">{children}</div>
    </Popover>
  );
}
