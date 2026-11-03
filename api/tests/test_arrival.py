from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from ishara.db import Store
from ishara.dispatcher import Conflict, Dispatcher
from ishara.llm import LLM
from ishara.main import create_app
from ishara.seed import seed

from .conftest import MEDICAL, approve_api, create_approved, tokens


def confirm(d):
    rid = create_approved(d, MEDICAL)
    offer = d.snapshot(rid)["offers"][0]
    token = tokens(d)[offer["interpreter_id"]]
    d.respond(token, offer["id"], True)
    return rid, token


def test_arrival_updates_are_reported_and_cleared_on_reassignment(d, clock):
    rid, token = confirm(d)
    assert d.snapshot(rid)["arrival"] is None
    d.update_arrival(token, rid, 5)
    snap = d.by_requester_token(d.snapshot(rid)["token"])
    assert snap["arrival"]["eta"] == clock.t + 300
    assert snap["arrival"]["updated_at"] == clock.t
    assert not snap["arrival"]["arrived"]
    assert d.events(rid)[-1]["kind"] == "arrival_updated"
    clock.t += 301
    assert not d.snapshot(rid)["arrival"]["arrived"]  # An elapsed estimate is not proof of arrival.
    d.update_arrival(token, rid, 0)
    assert d.snapshot(rid)["arrival"]["arrived"]
    assert d.interpreter_view(token)["items"][0]["arrival"]["arrived"]
    d.cancel(token, rid)
    assert d.snapshot(rid)["arrival"] is None
    backup = next(o for o in d.snapshot(rid)["offers"] if o["status"] == "pending")
    d.respond(tokens(d)[backup["interpreter_id"]], backup["id"], True)
    assert d.snapshot(rid)["arrival"] is None
    with pytest.raises(Conflict):
        d.update_arrival(token, rid, 5)


def test_only_current_interpreter_can_report_arrival(d):
    rid, token = confirm(d)
    other = next(t for t in tokens(d).values() if t != token)
    with pytest.raises(Conflict):
        d.update_arrival(other, rid, 5)
    d.complete(token, rid, "Visit complete.")
    with pytest.raises(Conflict):
        d.update_arrival(token, rid, 5)
    assert d.snapshot(rid)["arrival"] is None


def test_arrival_api_validates_input_and_ownership(cfg):
    with TestClient(create_app(cfg)) as c:
        snap = c.post("/api/requests", json={"text": MEDICAL}).json()
        assert approve_api(c, snap).status_code == 200
        snap = c.get(f"/api/requests/{snap['id']}").json()
        offer = snap["offers"][0]
        interpreters = c.get("/api/interpreters").json()
        token = next(i["token"] for i in interpreters if i["id"] == offer["interpreter_id"])
        url = f"/api/i/{token}/requests/{snap['id']}/arrival"
        assert c.post(url, json={"minutes": 5}).status_code == 409
        c.post(f"/api/i/{token}/offers/{offer['id']}/accept")
        for minutes in (-1, 241, 1.5, "5", True, None):
            assert c.post(url, json={"minutes": minutes}).status_code == 422
        assert c.post(url, json={"minutes": 5}).json() == {"ok": True}
        assert c.get(f"/api/r/{snap['token']}").json()["arrival"]["arrived"] is False
        assert c.post(f"/api/i/nope/requests/{snap['id']}/arrival", json={"minutes": 5}).status_code == 404


def test_existing_database_gains_arrival_table_without_losing_existing_data(tmp_path):
    import sqlite3

    path = str(tmp_path / "existing.db")
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE preserved (value TEXT)")
        db.execute("INSERT INTO preserved VALUES ('keep me')")
    store = Store(path)
    assert store.one("SELECT value FROM preserved")["value"] == "keep me"
    assert store.q("SELECT * FROM arrivals") == []


def test_arrival_survives_database_reopen(cfg, tmp_path, clock):
    path = str(tmp_path / "persist.db")
    store = Store(path)
    seed(store)
    d = Dispatcher(store, LLM(cfg), cfg, clock)
    rid, token = confirm(d)
    d.update_arrival(token, rid, 5)
    reopened = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    assert reopened.snapshot(rid)["arrival"] == d.snapshot(rid)["arrival"]


def test_service_and_video_are_only_shown_in_relevant_states(d, cfg):
    d.cfg = replace(cfg, confirmation_video_url="/sign/confirmed.mp4")
    rid, token = confirm(d)
    snap = d.snapshot(rid)
    assert snap["confirmation_video_url"] == "/sign/confirmed.mp4"
    assert snap["remote_interpreter_url"] is None
    d.cancel(token, rid)
    assert d.snapshot(rid)["confirmation_video_url"] is None
    for _ in range(5):
        for offer in d.snapshot(rid)["offers"]:
            if offer["status"] == "pending":
                d.respond(tokens(d)[offer["interpreter_id"]], offer["id"], False)
    assert d.snapshot(rid)["status"] == "escalated"
    assert d.snapshot(rid)["remote_interpreter_url"] == cfg.remote_interpreter_url
    d.cfg = replace(d.cfg, remote_interpreter_url="")
    assert d.snapshot(rid)["remote_interpreter_url"] is None


@pytest.mark.parametrize("url", ["javascript:alert(1)", "//example.com", "http://example.com", "https://user:pass@example.com"])
def test_provider_and_video_urls_reject_unsafe_values(cfg, url):
    with pytest.raises(ValueError):
        replace(cfg, remote_interpreter_url=url)
    with pytest.raises(ValueError):
        replace(cfg, confirmation_video_url=url)
