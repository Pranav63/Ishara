"use client";

import { CircleHelp } from "lucide-react";
import { useLanguage } from "@/components/Preferences";

export function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    [t("Read & review", "قراءة ومراجعة"), t("Ishara reads the appointment message and hides contact and ID numbers. The resident checks the date, place and sign language before matching starts.", "تقرأ إشارة رسالة الموعد وتحجب بيانات الاتصال والهوية. يراجع طالب الخدمة التاريخ والمكان ولغة الإشارة قبل بدء المطابقة.")],
    [t("Match", "مطابقة"), t("Eligible interpreters with the right sign language and a free slot receive offers. Medical and legal appointments require certification.", "يتلقى المترجمون المؤهلون المتاحون بلغة الإشارة المناسبة عروضاً. تتطلب المواعيد الطبية والقانونية الاعتماد المهني.")],
    [t("Confirm", "تأكيد"), t("A booking is confirmed when an interpreter accepts. Arrival updates come from the interpreter, without GPS tracking.", "يُؤكد الحجز عند قبول مترجم. يشارك المترجم تحديثات الوصول دون تتبع الموقع.")],
    [t("Get more support", "دعم إضافي"), t("Cancellations trigger rematching. If no match is available, the request enters the coordinator queue and remote support is offered.", "يؤدي الاعتذار إلى إعادة المطابقة. إذا لم يتوفر مترجم، يدخل الطلب قائمة انتظار المنسق ويُعرض الدعم عن بُعد.")],
  ];
  return <details className="workspace-help"><summary><CircleHelp size={18} aria-hidden />{t("How Ishara works", "كيف تعمل إشارة")}</summary><div className="how"><ol>{steps.map(([title, detail]) => <li key={title}><strong>{title}</strong><p>{detail}</p></li>)}</ol>
    <details><summary>{t("Who uses Coordinator?", "من يستخدم عرض المنسق؟")}</summary><p>{t("Coordinators are staff who manage interpreter offers and the support queue. You follow your own request on its private page. Staff tools require sign-in; the demo makes them available for testing.", "المنسقون موظفون يديرون عروض المترجمين وقائمة الدعم. تتابع طلبك في صفحته الخاصة. تتطلب أدوات الموظفين تسجيل الدخول؛ ويتيحها العرض التجريبي للاختبار.")}</p></details>
    <details><summary>{t("What happens to my contact details?", "ماذا يحدث لبيانات الاتصال؟")}</summary><p>{t("Phone numbers, email addresses and ID numbers are hidden before storage. Only include information needed for your appointment.", "تُحجب أرقام الهاتف وعناوين البريد وأرقام الهوية قبل التخزين. أدرج المعلومات اللازمة لموعدك فقط.")}</p></details>
  </div></details>;
}
