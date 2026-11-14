// Minimal RFC 5545 event so the appointment opens in Apple, Google or Outlook calendars.
const stamp = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (value: string) => value.replace(/[\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");

export function icsFor(event: { uid: string; title: string; start: number; minutes: number; location: string; description: string }, now = Date.now() / 1000) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ishara//Appointments//EN", "BEGIN:VEVENT",
    `UID:${event.uid}@ishara`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.start + event.minutes * 60)}`,
    `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.location)}`, `DESCRIPTION:${escape(event.description)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
