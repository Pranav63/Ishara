from __future__ import annotations

from typing import Optional

from .llm import LLM
from .models import Appointment
from .redact import redact
from .timefmt import fmt, fmt_date_time

_VOCAB = {
    "medical": ["referral", "prescription", "blood pressure", "fasting", "consent form", "follow-up visit"],
    "legal": ["hearing", "witness", "oath", "adjournment", "affidavit", "notary"],
    "government": ["Emirates ID", "residency", "renewal", "fine", "application number", "supporting documents"],
    "education": ["parent meeting", "report card", "support plan", "assessment", "enrolment"],
    "other": ["appointment", "reference number", "documents", "follow-up"],
}
_PRACTICE = [
    "Agree the sign variety with the client before the visit starts.",
    "Sit beside the service provider so the client can see you both.",
    "Interpret everything said in the room. Do not summarise or advise.",
]
_CONF = "Confirm confidentiality with the provider before you begin."
_SUMMARY_SYS = (
    "Rewrite the interpreter's visit notes as a short plain-language summary for a Deaf resident. "
    "Use short sentences. Add no facts and no medical or legal advice."
)


def build_briefing(appt: Appointment, travel_min: int) -> dict:
    arrive_by = appt.starts_at - 15 * 60
    leave_by = arrive_by - travel_min * 60
    practice = list(_PRACTICE)
    if appt.domain in ("medical", "legal"):
        practice.append(_CONF)
    return {
        "arrive_by": arrive_by,
        "leave_by": leave_by,
        "travel_min": travel_min,
        "vocabulary": _VOCAB[appt.domain],
        "practice": practice,
        "logistics": [
            f"{appt.entity}, {appt.area}",
            f"Starts {fmt(appt.starts_at)}, about {appt.duration_min} min",
            f"Leave by {fmt(leave_by)} (travel time is an estimate)",
        ],
    }


def confirmation(appt: Appointment, name: str, replacement: bool = False) -> dict:
    d, t = fmt_date_time(appt.starts_at)
    en = f"{name} will interpret your {appt.language} appointment at {appt.entity} on {fmt(appt.starts_at)}. They will arrive 15 minutes early."
    ar = f"تم تأكيد مترجم لغة الإشارة {name} لموعدك في {appt.entity} بتاريخ {d} الساعة {t}. سيصل قبل الموعد بربع ساعة."
    if replacement:
        en = "Your first interpreter could not make it, so we found a replacement. Your appointment time has not changed. " + en
        ar = "تعذّر حضور المترجم الأول، وتم تعيين مترجم بديل. موعدك كما هو. " + ar
    return {"en": en, "ar": ar}


def build_summary(notes: str, llm: LLM) -> dict:
    notes = redact(notes.strip())[0]
    if not notes:
        return {"en": "The visit is complete. The interpreter added no notes.", "ar": "اكتملت الزيارة. لم يضف المترجم أي ملاحظات."}
    if llm.enabled:
        en = llm.text(_SUMMARY_SYS, notes)
        if en:
            ar = llm.text("Translate to clear Modern Standard Arabic. Output only the translation.", en)
            return {"en": en, "ar": ar}
    return {"en": notes, "ar": None}
