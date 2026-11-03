"use client";

import { useState } from "react";
import { CompanionAvatar } from "@/components/CompanionAvatar";
import { useLanguage, usePreferences } from "@/components/Preferences";
import type { Status } from "@/lib/types";

const COPY = {
  idle: ["A little help, every step", "معك في كل خطوة", "Paste your appointment. I’ll help check the details before we look for an interpreter.", "ألصق رسالة موعدك. سأساعدك على مراجعة التفاصيل قبل البحث عن مترجم."],
  parsing: ["Reading your appointment", "أقرأ تفاصيل موعدك", "I’m preparing the details for you to check. Nothing is booked yet.", "أجهز التفاصيل لمراجعتها. لم يتم الحجز بعد."],
  reviewing: ["Let’s check the details", "لنراجع التفاصيل", "You choose what is correct. Matching starts only after you confirm.", "أنت تؤكد صحة التفاصيل. يبدأ البحث بعد موافقتك فقط."],
  dispatching: ["Looking for the right person", "نبحث عن المترجم المناسب", "Your request is being offered to eligible interpreters. You’ll see the result here.", "نعرض طلبك على المترجمين المؤهلين. ستظهر النتيجة هنا."],
  confirmed: ["Your interpreter is confirmed", "تم تأكيد مترجمك", "Their details and any arrival update appear below.", "تظهر بيانات المترجم وأي تحديث لوقت الوصول أدناه."],
  replanning: ["Finding a replacement", "نبحث عن مترجم بديل", "Your interpreter cancelled. Ishara is checking available replacements.", "اعتذر مترجمك. تتحقق إشارة من توفر مترجم بديل."],
  escalated: ["Let’s get more support", "لنطلب دعماً إضافياً", "No in-person interpreter is confirmed. Check coordinator updates or try remote support.", "لم يتم تأكيد مترجم حضوري. راجع تحديث المنسق أو جرب الدعم عن بُعد."],
  completed: ["Your visit is complete", "اكتملت زيارتك", "You can read your visit summary below.", "يمكنك قراءة ملخص زيارتك أدناه."],
};

export function AgentCompanion({ status, busy = false, compact = false }: { status?: Status; busy?: boolean; compact?: boolean }) {
  const { isAr, t } = useLanguage();
  const { prefs } = usePreferences();
  const [reaction, setReaction] = useState(0);
  const state = busy ? "parsing" : status ?? "idle";
  const copy = COPY[state];
  if (compact && prefs.textOnly) return null;
  return <div className={`agent-companion${compact ? " compact" : ""}`} data-state={state}>
    {!prefs.textOnly && <button type="button" className="companion-touch" onClick={() => setReaction((v) => v + 1)} aria-label={t("Say hello to Dana", "ألقِ التحية على دانة")} title={t("Tap to say hello", "انقر لإلقاء التحية")} onPointerMove={(e) => {
      if (prefs.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--look-x", `${((e.clientX - rect.left) / rect.width - .5) * 5}px`);
      e.currentTarget.style.setProperty("--look-y", `${((e.clientY - rect.top) / rect.height - .5) * 4}px`);
    }} onPointerLeave={(e) => { e.currentTarget.style.setProperty("--look-x", "0px"); e.currentTarget.style.setProperty("--look-y", "0px"); }}>
      <span key={`${prefs.companion}-${reaction}`} className="companion-sprite" data-greeting={reaction > 0 ? "true" : undefined}><CompanionAvatar kind={prefs.companion} /></span>
    </button>}
    {!compact && <div className="agent-copy"><span className="agent-name">{t("Dana · your Ishara guide", "دانة · دليلتك في إشارة")}</span><strong>{copy[isAr ? 1 : 0]}</strong><p>{copy[isAr ? 3 : 2]}</p></div>}
  </div>;
}
