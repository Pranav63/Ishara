"use client";

import { AnimatePresence, m } from "motion/react";
import { Info, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export function Modal({ open, onClose, title, closeLabel, children }: { open: boolean; onClose: () => void; title: string; closeLabel: string; children: React.ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return <dialog ref={dialog} className="app-dialog" aria-labelledby={id} onClose={onClose} onClick={(e) => {
    if (e.target !== e.currentTarget) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) e.currentTarget.close();
  }}>
    <header className="app-dialog-head"><h2 id={id}>{title}</h2><button type="button" autoFocus className="icon-btn" aria-label={closeLabel} onClick={() => dialog.current?.close()}><X size={20} aria-hidden /></button></header>
    <div className="app-dialog-body">{children}</div>
  </dialog>;
}

// Small popover anchored to its trigger. Closes on Escape or an outside click.
export function Popover({ trigger, label, children, align = "start", wide }: { trigger: React.ReactNode; label: string; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: "start" | "end"; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
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
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
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
      <button ref={triggerRef} type="button" className="pop-trigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <m.div ref={setPanel} id={id} role="dialog" aria-label={label} className={`popover glass ${align}${wide ? " wide" : ""}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 500, damping: 34 }}>
            {typeof children === "function" ? children(close) : children}
            <PopoverClose onClose={close} />
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
