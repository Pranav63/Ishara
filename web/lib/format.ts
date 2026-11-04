const TZ = "Asia/Dubai";

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, ...opts });
const hm = f({ hour: "2-digit", minute: "2-digit" });
const hms = f({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
const day = f({ weekday: "long", day: "numeric", month: "long" });

export const clock = (ts: number) => hm.format(ts * 1000);
export const clockSec = (ts: number) => hms.format(ts * 1000);
export const when = (ts: number) => `${day.format(ts * 1000)} at ${hm.format(ts * 1000)}`;

export function duration(seconds: number, lang: "en" | "ar") {
  const unit = (value: number, name: string) => new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-GB", { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  if (Math.round(seconds) < 60) return unit(Math.round(seconds), "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = unit(Math.floor(minutes / 60), "hour");
  return minutes % 60 ? `${hours} ${unit(minutes % 60, "minute")}` : hours;
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const STATUS: Record<string, { label: string; tone: "ok" | "wait" | "bad" | "idle" }> = {
  parsing: { label: "Reading the message", tone: "idle" },
  reviewing: { label: "Review appointment details", tone: "wait" },
  dispatching: { label: "Offering to interpreters", tone: "wait" },
  confirmed: { label: "Interpreter confirmed", tone: "ok" },
  replanning: { label: "Finding a replacement", tone: "wait" },
  escalated: { label: "Needs a coordinator", tone: "bad" },
  completed: { label: "Visit complete", tone: "ok" },
};

export const SAMPLES = [
  {
    label: "Hospital visit",
    text: "Dubai Health: your appointment is confirmed at Rashid Hospital, Oud Metha, on 12 Nov 2026 at 10:30 AM with Dr. Hassan. Call 050 123 4567 if needed.",
  },
  {
    label: "Emirates ID renewal",
    text: "ICP: your Emirates ID renewal is booked at the Al Barsha customer happiness centre tomorrow at 2:00 PM.",
  },
  {
    label: "School meeting",
    text: "Parent meeting at the school in Mirdif on Thursday at 4:30 PM about the support plan.",
  },
];
