from datetime import datetime

from ishara.matcher import rank
from ishara.models import Appointment
from ishara.parser import parse_rules
from ishara.redact import redact
from ishara.seed import _DEMO
from ishara.timefmt import DUBAI

from .conftest import GOV, MEDICAL, T0


def test_redact_hides_identifiers_but_keeps_dates():
    text, n = redact("Call 050 123 4567, mail a@b.ae, EID 784-1990-1234567-1, on 12/11/2026 at 10:30")
    assert n == 3
    assert "[PHONE]" in text and "[EMAIL]" in text and "[EMIRATES_ID]" in text
    assert "12/11/2026 at 10:30" in text


def test_parse_medical():
    a = parse_rules(redact(MEDICAL)[0], T0)
    local = datetime.fromtimestamp(a.starts_at, DUBAI)
    assert (a.entity, a.area, a.domain) == ("Rashid Hospital", "Oud Metha", "medical")
    assert (local.month, local.day, local.hour, local.minute) == (11, 12, 10, 30)
    assert a.assumed == []


def test_parse_relative_date_and_area():
    a = parse_rules(GOV, T0)
    local = datetime.fromtimestamp(a.starts_at, DUBAI)
    assert (a.area, a.domain) == ("Al Barsha", "government")
    assert (local.day, local.hour) == (5, 14)


def test_parse_flags_guesses():
    a = parse_rules("Please arrange an interpreter for my school meeting", T0)
    assert a.domain == "education" and {"date", "time", "location"} <= set(a.assumed)


def _interps():
    return [
        {"id": i, "name": n, "languages": l, "domains": dm, "certified": c, "area": ar, "reliability": r, "available": True}
        for i, n, l, dm, c, ar, r in _DEMO
    ]


def _appt(**kw):
    return Appointment(**{"entity": "Rashid Hospital", "area": "Oud Metha", "starts_at": T0 + 86400, "domain": "medical", **kw})


def test_matcher_filters_and_prefers_close_specialist():
    ranked = rank(_interps(), _appt(), set(), set())
    names = [c.interpreter["name"] for c in ranked]
    assert "Fatima H." not in names  # not certified, medical needs certification
    assert "Daniel P." not in names  # no UAE Sign Language
    assert names[0] == "Mariam A."  # same area, medical specialist


def test_matcher_respects_busy_and_exclude():
    ranked = rank(_interps(), _appt(), {"i1"}, {"i3"})
    assert {"i1", "i3"}.isdisjoint(c.interpreter["id"] for c in ranked)
