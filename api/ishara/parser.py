from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from .llm import LLM
from .models import Appointment
from .places import ENTITIES, PLACES
from .redact import redact
from .timefmt import DUBAI

_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_MONTH_RE = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_DOMAINS = [
    ("legal", ["court", "courts", "police", "prosecution", "lawyer", "notary", "tribunal", "hearing"]),
    ("medical", ["hospital", "clinic", "doctor", "dr", "dha", "cardiology", "dental", "physio", "lab", "scan", "radiology", "paediatric"]),
    ("government", ["rta", "emirates id", "icp", "visa", "immigration", "municipality", "dewa", "ministry", "licence", "license", "tasheel", "amer", "customer happiness"]),
    ("education", ["school", "university", "college", "teacher", "parent", "kha"]),
]
_SCHEMA = {
    "type": "object",
    "properties": {
        "entity": {"type": "string"},
        "area": {"type": "string"},
        "starts_at": {"type": ["string", "null"]},
        "duration_min": {"type": "integer"},
        "domain": {"type": "string", "enum": ["medical", "legal", "government", "education", "other"]},
        "language": {"type": "string"},
    },
    "required": ["entity", "area", "starts_at", "domain"],
}


def _domain(low: str) -> str:
    for name, words in _DOMAINS:
        if re.search(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b", low):
            return name
    return "other"


def _area(low: str) -> Optional[str]:
    for name in sorted(PLACES, key=len, reverse=True):
        if name.lower() in low:
            return name
    return None


def _date(low: str, today: datetime):
    d = None
    if m := re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b", low):
        y = int(m[3]) + (2000 if int(m[3]) < 100 else 0)
        d = (y, int(m[2]), int(m[1]))
    elif m := re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+{_MONTH_RE}\b\.?(?:,?\s+(\d{{4}}))?", low):
        d = (int(m[3]) if m[3] else None, _MONTHS.index(m[2][:3]) + 1, int(m[1]))
    elif m := re.search(rf"\b{_MONTH_RE}\b\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?", low):
        d = (int(m[3]) if m[3] else None, _MONTHS.index(m[1][:3]) + 1, int(m[2]))
    if d:
        y, mo, day = d
        try:
            if y is None:
                y = today.year
                if datetime(y, mo, day, tzinfo=DUBAI).date() < today.date():
                    y += 1
            return datetime(y, mo, day, tzinfo=DUBAI).date()
        except ValueError:
            return None
    if "tomorrow" in low:
        return (today + timedelta(days=1)).date()
    if re.search(r"\btoday\b", low):
        return today.date()
    for i, w in enumerate(_WEEKDAYS):
        if re.search(rf"\b{w}\b", low):
            return (today + timedelta(days=(i - today.weekday()) % 7 or 7)).date()
    return None


def _time(low: str):
    m = re.search(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?", low) or re.search(r"\b(\d{1,2})()\s*(am|pm)\b", low)
    if not m:
        return None
    h, mi, ap = int(m[1]), int(m[2] or 0), m[3]
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return (h, mi) if h < 24 and mi < 60 else None


def parse_rules(text: str, now: float) -> Appointment:
    low = text.lower()
    today = datetime.fromtimestamp(now, DUBAI)
    assumed = []

    entity = area = None
    domain = _domain(low)
    for key, (name, a, dom) in ENTITIES.items():
        if key in low:
            entity, area, domain = name, a, dom
            break
    area = area or _area(low)
    if not area:
        area = "Bur Dubai"
        assumed.append("location")
    if not entity:
        m = re.search(r"\bat\s+(?:the\s+)?([A-Z][\w&'.\- ]{2,45}?)(?=\s+(?:on|at|in|tomorrow|today)\b|[,.]|$)", text)
        entity = m[1].strip() if m else "Appointment venue"
        if not m:
            assumed.append("venue")

    day = _date(low, today)
    hm = _time(low)
    if day is None:
        day = (today + timedelta(days=1)).date()
        assumed.append("date")
    if hm is None:
        hm = (10, 0)
        assumed.append("time")
    starts = datetime(day.year, day.month, day.day, hm[0], hm[1], tzinfo=DUBAI).timestamp()

    language = "UAE Sign Language"
    if re.search(r"\basl\b|american sign", low):
        language = "ASL"
    elif "international sign" in low:
        language = "International Sign"
    return Appointment(entity=entity, area=area, starts_at=starts, domain=domain, language=language, assumed=assumed)


def refine_with_llm(text: str, base: Appointment, llm: LLM, now: float) -> Appointment:
    """Overlay model output on the rules result; any invalid field keeps the rules value."""
    if not llm.enabled:
        return base
    today = datetime.fromtimestamp(now, DUBAI).strftime("%A %d %B %Y")
    system = (
        f"Extract one appointment from the message. Today is {today} (Dubai time). Reply with JSON only. "
        f"area must be one of: {', '.join(PLACES)}. starts_at is local time as YYYY-MM-DDTHH:MM, or null if "
        "missing. domain is medical, legal, government, education or other. "
        "language is 'UAE Sign Language' unless the message asks for ASL or International Sign."
    )
    data = llm.json(system, redact(text)[0], _SCHEMA)
    if not data:
        return base
    upd = {}
    if isinstance(data.get("entity"), str) and data["entity"].strip():
        upd["entity"] = data["entity"].strip()[:80]
    if data.get("area") in PLACES:
        upd["area"] = data["area"]
    if data.get("domain") in ("medical", "legal", "government", "education", "other"):
        upd["domain"] = data["domain"]
    if isinstance(data.get("language"), str) and data["language"].strip():
        upd["language"] = data["language"].strip()[:40]
    try:
        upd["starts_at"] = datetime.strptime(data["starts_at"], "%Y-%m-%dT%H:%M").replace(tzinfo=DUBAI).timestamp()
    except (TypeError, ValueError, KeyError):
        pass
    assumed = [a for a in base.assumed if not (a == "location" and "area" in upd) and not (a == "venue" and "entity" in upd)]
    if "starts_at" in upd:
        assumed = [a for a in assumed if a not in ("date", "time")]
    return base.model_copy(update={**upd, "assumed": assumed, "source": "llm"})
