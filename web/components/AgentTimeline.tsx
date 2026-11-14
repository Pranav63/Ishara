"use client";

import { AgentOrb } from "@/components/AgentCompanion";
import { useLanguage } from "@/components/Preferences";
import type { Snapshot } from "@/lib/types";

type Item = { id: number; ts: number; kind: string; text?: string };
type Line = (n: string, count: number) => string;
const one = (text: string): Line => () => text;

// [English, Arabic, tone]. Counted lines receive a localized number when the same step repeats.
const COPY: Record<string, [Line, Line, "ok" | "warn" | ""]> = {
  received: [one("Received your message"), one("استلمت رسالتك"), ""],
  parsed: [one("Read the appointment details"), one("قرأت تفاصيل الموعد"), ""],
  approved: [one("You confirmed the details"), one("أكدت التفاصيل"), "ok"],
  offered: [(n, c) => c > 1 ? `Offered to ${n} qualified interpreters` : "Offered to a qualified interpreter", (n, c) => c > 1 ? `عرضت الطلب على ${n} من المترجمين المؤهلين` : "عرضت الطلب على مترجم مؤهل", ""],
  declined: [(n, c) => c > 1 ? `${n} interpreters were unavailable` : "An interpreter was unavailable", (n, c) => c > 1 ? `${n} من المترجمين غير متاحين` : "أحد المترجمين غير متاح", ""],
  expired: [(n, c) => c > 1 ? `${n} offers expired without a reply` : "An offer expired without a reply", (n, c) => c > 1 ? `انتهت ${n} عروض دون رد` : "انتهى عرض دون رد", ""],
  accepted: [one("An interpreter accepted"), one("قبل مترجم الطلب"), "ok"],
  briefing_sent: [one("Briefed your interpreter and sent your confirmation"), one("أرسلت ملخصاً للمترجم وتأكيداً لك"), "ok"],
  standby_reserved: [one("Kept a backup interpreter ready"), one("جهزت مترجماً احتياطياً"), ""],
  interpreter_cancelled: [one("Your interpreter cancelled"), one("اعتذر مترجمك"), "warn"],
  backup_promoted: [one("Offered the slot to the backup interpreter"), one("عرضت الموعد على المترجم الاحتياطي"), ""],
  no_match: [one("No interpreter was free, so I asked a coordinator"), one("لم يتوفر مترجم، فطلبت دعم المنسق"), "warn"],
  coordinator_acknowledged: [one("A coordinator picked up your request"), one("استلم المنسق طلبك"), "ok"],
  arrival_updated: [(n, c) => c > 1 ? `Interpreter shared ${n} arrival updates` : "Interpreter shared an arrival update", (n, c) => c > 1 ? `شارك المترجم ${n} تحديثات للوصول` : "شارك المترجم تحديثاً للوصول", ""],
  completed: [one("Visit complete. Summary sent"), one("اكتملت الزيارة وأُرسل الملخص"), "ok"],
  // Coordinator-only: the API never sends this kind to requesters.
  reliability_updated: [one("Updated interpreter reliability from the outcome"), one("حدّثت موثوقية المترجم بناءً على النتيجة"), ""],
};

const NOW: Partial<Record<Snapshot["status"], [string, string]>> = {
  parsing: ["Reading your message", "أقرأ رسالتك"],
  dispatching: ["Waiting for an interpreter to accept", "بانتظار قبول مترجم"],
  replanning: ["Finding a replacement", "أبحث عن مترجم بديل"],
};

export function AgentTimeline({ items, status, waitingForCoordinator = false, detailed = false, heading = "h2" }: { items: Item[]; status: Snapshot["status"]; waitingForCoordinator?: boolean; detailed?: boolean; heading?: "h2" | "h3" }) {
  const { t, isAr, lang } = useLanguage();
  const number = new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-GB");
  const clock = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false });
  // Requesters see repeated steps once with a count; coordinators see every event with its detail.
  const rows: (Item & { count: number })[] = [];
  for (const item of items) {
    if (!COPY[item.kind]) continue;
    const last = rows[rows.length - 1];
    if (!detailed && last?.kind === item.kind) { last.count++; last.ts = item.ts; } else rows.push({ ...item, count: 1 });
  }
  const now = waitingForCoordinator ? ["Waiting for a coordinator", "بانتظار المنسق"] : NOW[status];
  const Heading = heading;
  return <div className="agent-timeline">
    <div className="timeline-head"><AgentOrb state={waitingForCoordinator ? "escalated" : status} /><Heading className="timeline-title">{t("What Ishara has done", "ما قامت به إشارة")}</Heading></div>
    <ol className="timeline">
      {rows.map(row => {
        const [en, ar, tone] = COPY[row.kind];
        return <li key={row.id} className={tone || undefined}>
          <span className="tl-dot" aria-hidden />
          <div className="tl-body"><p>{(isAr ? ar : en)(number.format(row.count), row.count)}</p>{detailed && row.text && <p className="tl-detail" dir="auto">{row.text}</p>}</div>
          <time className="num" dateTime={new Date(row.ts * 1000).toISOString()}>{clock.format(row.ts * 1000)}</time>
        </li>;
      })}
      {now && <li className="now" aria-current="step"><span className="tl-dot" aria-hidden /><div className="tl-body"><p>{isAr ? now[1] : now[0]}</p></div></li>}
    </ol>
  </div>;
}
