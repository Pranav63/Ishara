from __future__ import annotations

from dataclasses import dataclass

from .models import Appointment
from .places import travel_minutes


@dataclass
class Candidate:
    interpreter: dict
    score: float
    travel_min: int
    reasons: list


def rank(interpreters: list, appt: Appointment, busy: set, exclude: set) -> list:
    """Hard filters first (language, certification, availability), then a weighted score."""
    out = []
    needs_cert = appt.domain in ("medical", "legal")
    for i in interpreters:
        if not i["available"] or i["id"] in busy or i["id"] in exclude:
            continue
        if appt.language not in i["languages"]:
            continue
        if needs_cert and not i["certified"]:
            continue
        travel = travel_minutes(i["area"], appt.area)
        fit = 1.0 if appt.domain in i["domains"] else 0.3
        score = 0.40 * max(0.0, 1 - travel / 60) + 0.25 * fit + 0.20 * i["reliability"] + 0.15 * (1.0 if i["certified"] else 0.0)
        reasons = [f"{travel} min away"]
        if i["certified"]:
            reasons.append("certified")
        if appt.domain in i["domains"] and appt.domain != "other":
            reasons.append(f"{appt.domain} experience")
        reasons.append(f"{round(i['reliability'] * 100)}% reliable")
        out.append(Candidate(i, round(score, 4), travel, reasons))
    return sorted(out, key=lambda c: (-c.score, c.interpreter["id"]))
