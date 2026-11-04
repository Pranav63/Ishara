"use client";

import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/components/Preferences";
import { Modal } from "@/components/ui";

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const steps = [
    [t("Share & review", "شارك وراجع"), t("Paste your appointment message, then check the place, date, time and sign language.", "ألصق رسالة موعدك، ثم راجع المكان والتاريخ والوقت ولغة الإشارة.")],
    [t("Find your interpreter", "اعثر على مترجمك"), t("Available interpreters receive offers. Your booking is confirmed only when someone accepts.", "يتلقى المترجمون المتاحون عروضاً. يتأكد حجزك فقط عند قبول أحدهم.")],
    [t("Follow in text", "تابع بالنص"), t("See updates on your private request page, including arrival estimates shared by your interpreter.", "تابع التحديثات في صفحة طلبك الخاصة، بما فيها وقت الوصول المتوقع الذي يشاركه مترجمك.")],
  ];
  const questions = [
    [t("What if nobody is available?", "ماذا لو لم يتوفر مترجم؟"), t("Your request goes to the coordinator queue. Remote video support is shown when available. If an interpreter cancels, matching starts again.", "ينتقل طلبك إلى قائمة انتظار المنسق. يظهر الدعم المرئي عن بُعد عند توفره. إذا اعتذر المترجم، تبدأ المطابقة مجدداً.")],
    [t("Who uses Coordinator?", "من يستخدم عرض المنسق؟"), t("Staff manage offers and support requests. You stay on your private request page. Staff sign in; the demo also lets you try their view.", "يدير الموظفون العروض وطلبات الدعم. تبقى أنت في صفحة طلبك الخاصة. يسجّل الموظفون الدخول؛ ويتيح العرض التجريبي تجربة واجهتهم أيضاً.")],
    [t("How are interpreters matched?", "كيف تتم مطابقة المترجمين؟"), t("By sign language, availability and appointment type. Medical and legal appointments require certified interpreters.", "حسب لغة الإشارة والتوفر ونوع الموعد. تتطلب المواعيد الطبية والقانونية مترجمين معتمدين.")],
    [t("What about my privacy?", "ماذا عن خصوصيتي؟"), t("Phone numbers, email addresses and ID numbers are hidden before storage. Arrival times come from the interpreter, without GPS tracking. Share only the details needed for your appointment.", "تُحجب أرقام الهاتف وعناوين البريد وأرقام الهوية قبل التخزين. يشارك المترجم وقت الوصول دون تتبع الموقع. شارك فقط التفاصيل اللازمة لموعدك.")],
  ];
  return <Modal open={open} onClose={onClose} title={t("How Ishara works", "كيف تعمل إشارة")} closeLabel={t("Close guide", "إغلاق الدليل")}><div className="how">
    <ol className="how-steps" role="list">{steps.map(([title, detail], i) => <li key={title}><span className="how-step-number" aria-hidden>{i + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
    <div className="how-questions">{questions.map(([question, answer]) => <details key={question} name="ishara-help-questions"><summary>{question}<ChevronDown size={16} aria-hidden /></summary><p>{answer}</p></details>)}</div>
  </div></Modal>;
}
