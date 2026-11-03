from dataclasses import replace
from datetime import datetime

import pytest

from ishara.config import Settings
from ishara.db import Store
from ishara.dispatcher import Dispatcher
from ishara.llm import LLM
from ishara.models import ApprovalIn
from ishara.seed import seed
from ishara.timefmt import DUBAI

T0 = datetime(2026, 11, 4, 8, 0, tzinfo=DUBAI).timestamp()
MEDICAL = "Dubai Health: your appointment is confirmed at Rashid Hospital, Oud Metha, on 12 Nov 2026 at 10:30 AM with Dr. Hassan. Call 050 123 4567 if needed."
GOV = "ICP: your Emirates ID renewal is booked at the Al Barsha customer happiness centre tomorrow at 2:00 PM."


class Clock:
    def __init__(self):
        self.t = T0

    def __call__(self):
        return self.t


@pytest.fixture
def cfg():
    return replace(Settings.load(), llm_provider="none", db_path=":memory:", offer_ttl_s=30, wave_size=2, demo_mode=True, operator_key="", telegram_token="")


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture(autouse=True)
def api_clock(monkeypatch, clock):
    monkeypatch.setattr("ishara.main.Dispatcher", lambda store, llm, cfg: Dispatcher(store, llm, cfg, clock))


@pytest.fixture
def d(cfg, clock):
    store = Store(":memory:")
    seed(store)
    return Dispatcher(store, LLM(cfg), cfg, clock)


def tokens(d):
    return {i["id"]: i["token"] for i in d.interpreters(with_tokens=True)}


def create_approved(d, text, name=""):
    rid = d.create_request(text, name)
    snap = d.snapshot(rid)
    details = ApprovalIn(**{k: snap["appointment"][k] for k in ApprovalIn.model_fields})
    d.approve(snap["token"], details)
    return rid


def approve_api(c, snap):
    return c.post(f"/api/r/{snap['token']}/approve", json={k: snap["appointment"][k] for k in ApprovalIn.model_fields})
