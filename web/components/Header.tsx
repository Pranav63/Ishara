"use client";

import { m } from "motion/react";
import { Hand } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/components/Preferences";
import { stepOf } from "@/lib/state";
import type { Status } from "@/lib/types";

export function Progress({ status }: { status?: Status }) {
  const { t } = useLanguage();
  const STEPS = [t("Review", "مراجعة"), t("Matching", "مطابقة"), t("Confirmed", "تأكيد"), t("Done", "اكتمال")];
  const at = stepOf(status);
  const bad = status === "escalated";
  const recovering = status === "replanning";
  return (
    <ol className="progress" aria-label={t("Request progress", "تقدم الطلب")}>
      {STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "todo";
        return (
          <li key={s} className={`p-step ${state}${i === at && (bad || recovering) ? " alert" : ""}`} aria-current={i === at ? "step" : undefined}>
            {i === at && <m.span layoutId="p-pill" className="p-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="p-dot" aria-hidden />
            <span className="p-label">{i === at && recovering ? t("Replacing", "استبدال") : i === at && bad ? t("Support", "دعم") : s}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Header({ status, children }: { status?: Status; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <header className="header glass">
      <Link href="/" className="brand" aria-label={t("Ishara home", "إشارة، الرئيسية")}>
        <span className="mark" aria-hidden><Hand size={18} strokeWidth={2.2} /></span>
        <span className="brand-name" translate="no">Ishara</span>
        <span className="brand-ar" lang="ar" aria-hidden>إشارة</span>
      </Link>
      <div className="header-center">{status && <Progress status={status} />}</div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
