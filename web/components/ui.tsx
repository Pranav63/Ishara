"use client";

import { AnimatePresence, m } from "motion/react";
import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

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
          <m.div id={id} role="dialog" aria-label={label} className={`popover glass ${align}${wide ? " wide" : ""}`} initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 500, damping: 34 }}>
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
