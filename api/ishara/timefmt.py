from __future__ import annotations

from datetime import datetime, timedelta, timezone

DUBAI = timezone(timedelta(hours=4))  # UAE has no DST


def fmt(ts: float) -> str:
    return datetime.fromtimestamp(ts, DUBAI).strftime("%a %d %b, %H:%M")


def fmt_date_time(ts: float) -> tuple:
    d = datetime.fromtimestamp(ts, DUBAI)
    return d.strftime("%d/%m/%Y"), d.strftime("%H:%M")
