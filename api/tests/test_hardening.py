import asyncio
import json
import queue
import threading
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from ishara.db import Store
from ishara.briefing import build_summary
from ishara.dispatcher import Conflict, Dispatcher
from ishara.llm import LLM
from ishara.main import create_app
from ishara.models import ApprovalIn
from ishara.seed import seed

from .conftest import MEDICAL, approve_api, create_approved, tokens
from .test_telegram import Fake, click, msg


def details(snap, **changes):
    return {**{k: snap["appointment"][k] for k in ApprovalIn.model_fields}, **changes}


def test_every_request_waits_for_owner_review(d):
    rid = d.create_request("Please arrange an interpreter for my school meeting")
    snap = d.snapshot(rid)
    assert snap["status"] == "reviewing"
    assert snap["appointment"]["assumed"]
    assert not snap["offers"]
    approved = d.approve(snap["token"], ApprovalIn(**details(snap, entity="School meeting", area="Al Barsha", language="ASL")))
    assert approved["status"] == "dispatching"
    assert approved["appointment"]["assumed"] == []
    assert approved["appointment"]["entity"] == "School meeting"
    assert "offers" not in approved
    with pytest.raises(Conflict):
        d.approve(snap["token"], ApprovalIn(**details(snap)))


def test_approval_validates_owner_and_explicit_fields(cfg):
    with TestClient(create_app(cfg)) as c:
        snap = c.post("/api/requests", json={"text": MEDICAL}).json()
        base = f"/api/r/{snap['token']}/approve"
        assert c.post("/api/r/wrong-owner/approve", json=details(snap)).status_code == 404
        for changes in ({"area": "Unknown"}, {"language": "spoken Arabic"}, {"domain": "anything"}, {"duration_min": -1}, {"duration_min": True}, {"starts_at": "NaN"}, {"entity": "  "}, {"unexpected": True}):
            assert c.post(base, json=details(snap, **changes)).status_code == 422
        assert c.post(base, json=details(snap, starts_at=1)).status_code == 409
        assert c.post(base, json=details(snap, starts_at=10**15)).status_code == 409
        assert c.get(f"/api/requests/{snap['id']}").json()["offers"] == []
        assert approve_api(c, snap).status_code == 200
        assert approve_api(c, snap).status_code == 409
        offers = c.get(f"/api/requests/{snap['id']}").json()["offers"]
        interpreters = {i["id"]: i for i in c.get("/api/interpreters").json()}
        assert all(interpreters[o["interpreter_id"]]["certified"] for o in offers)


def test_production_fails_closed_without_operator_key(cfg):
    with pytest.raises(ValueError, match="ISHARA_OPERATOR_KEY"):
        create_app(replace(cfg, demo_mode=False))
    with pytest.raises(ValueError, match="ISHARA_OPERATOR_KEY"):
        create_app(replace(cfg, demo_mode=False, operator_key="short"))


def test_operator_auth_protects_private_views_and_uses_httponly_cookie(cfg):
    app = create_app(replace(cfg, demo_mode=False, operator_key="x" * 48, operator_cookie_secure=False))
    assert app.state.dispatcher.interpreters(True) == []  # No fictional people provisioned in production.
    seed(app.state.dispatcher.store)
    with TestClient(app) as c:
        snap = c.post("/api/requests", json={"text": MEDICAL}).json()
        assert "offers" not in snap and "events" not in snap and "briefing" not in snap
        paths = ["/api/interpreters", "/api/metrics", "/api/requests/latest", f"/api/requests/{snap['id']}", "/api/escalations", "/api/stream"]
        assert all(c.get(path).status_code == 401 for path in paths)
        assert c.post("/api/demo/reset").status_code == 401
        assert c.post(f"/api/escalations/{snap['id']}/acknowledge", json={"note": ""}).status_code == 401
        assert c.get(f"/api/r/{snap['token']}").status_code == 200
        assert c.post("/api/operator/session", json={"key": "wrong"}).status_code == 401
        login = c.post("/api/operator/session", json={"key": "x" * 48})
        assert login.status_code == 200
        assert "HttpOnly" in login.headers["set-cookie"] and "SameSite=lax" in login.headers["set-cookie"]
        assert c.get("/api/operator/session").json()["authenticated"]
        assert c.get("/api/interpreters").status_code == 200
        assert c.post("/api/demo/reset").status_code == 403
        c.delete("/api/operator/session")
        assert c.get("/api/interpreters").status_code == 401
        assert c.get("/api/interpreters", headers={"X-Operator-Key": "x" * 48}).status_code == 200
        c.cookies.set("ishara_operator", "999999999999.invalid", path="/api")
        assert c.get("/api/interpreters").status_code == 401


@pytest.mark.parametrize("cursor", ["bad", "-1", "1.5", "9223372036854775808", "1" * 100])
def test_event_cursor_rejects_malformed_header_and_query(cfg, cursor):
    with TestClient(create_app(cfg)) as c:
        assert c.get("/api/stream", headers={"Last-Event-ID": cursor}).status_code == 422
        assert c.get("/api/stream", params={"after": cursor}).status_code == 422


def test_event_stream_identity_is_validated(cfg):
    with TestClient(create_app(replace(cfg, demo_mode=False, operator_key="x" * 48))) as c:
        assert c.get("/api/stream", params={"requester_token": "bad"}).status_code == 404
        assert c.get("/api/stream", params={"interpreter_token": "bad"}).status_code == 404
        assert c.get("/api/stream", params={"requester_token": "a", "interpreter_token": "b"}).status_code == 422


def test_scoped_stream_has_only_owned_events_and_no_private_payload(cfg):
    app = create_app(cfg)
    d = app.state.dispatcher
    first = create_approved(d, MEDICAL, "Private name")
    second = d.create_request("A different resident needs a school interpreter")
    snap = d.snapshot(first)
    iid = snap["offers"][0]["interpreter_id"]
    assert {e["request_id"] for e in d.events_after(0, interpreter_id=iid)} == {first}
    assert {e["request_id"] for e in d.events_after(0, requester_rid=second)} == {second}
    endpoint = next(r.endpoint for r in app.routes if getattr(r, "path", "") == "/api/stream")

    async def read():
        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request({"type": "http", "method": "GET", "path": "/api/stream", "headers": []}, receive)
        response = await endpoint(request, after=0, requester_token=snap["token"], interpreter_token=None)
        iterator = response.body_iterator
        assert await anext(iterator) == "retry: 1500\n\n"
        rows = []
        for _ in d.events(first):
            chunk = await anext(iterator)
            rows.append(json.loads(chunk.split("data: ", 1)[1]))
        await iterator.aclose()
        return rows

    rows = asyncio.run(read())
    assert {e["request_id"] for e in rows} == {first}
    assert all(set(e) == {"id", "request_id", "ts", "kind"} for e in rows)
    assert "Private name" not in json.dumps(rows)


def test_accept_rechecks_overlap_after_both_offers_were_sent(d):
    first, second = create_approved(d, MEDICAL), create_approved(d, MEDICAL)
    first_offer = d.snapshot(first)["offers"][0]
    second_offer = next(o for o in d.snapshot(second)["offers"] if o["interpreter_id"] == first_offer["interpreter_id"])
    token = tokens(d)[first_offer["interpreter_id"]]
    d.respond(token, first_offer["id"], True)
    with pytest.raises(Conflict, match="overlapping"):
        d.respond(token, second_offer["id"], True)
    assert d.snapshot(second)["assigned"] is None


def test_completion_cannot_overwrite_reassignment(d, monkeypatch):
    rid = create_approved(d, MEDICAL)
    offer = d.snapshot(rid)["offers"][0]
    token = tokens(d)[offer["interpreter_id"]]
    d.respond(token, offer["id"], True)

    def slow_summary(*_):
        d.cancel(token, rid)
        return {"en": "Old assignment", "ar": None}

    monkeypatch.setattr("ishara.dispatcher.build_summary", slow_summary)
    with pytest.raises(Conflict, match="assignment changed"):
        d.complete(token, rid, "Done")
    assert d.snapshot(rid)["status"] == "replanning"
    assert d.snapshot(rid)["summary"] is None


def test_escalation_queue_and_acknowledgment_persist(cfg, clock, tmp_path):
    path = str(tmp_path / "queue.db")
    d = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    rid = create_approved(d, MEDICAL)
    snap = d.snapshot(rid)
    assert snap["status"] == "escalated" and snap["escalation"]["status"] == "pending"
    assert len(d.escalations()) == 1
    d.acknowledge(rid, "Call 050 123 4567 or mail private@example.com")
    reopened = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    row = reopened.by_requester_token(snap["token"])["escalation"]
    assert row["status"] == "acknowledged" and row["acknowledged_at"] == clock.t
    assert "050" not in row["note"] and "private@example.com" not in row["note"]
    reopened.acknowledge(rid, "Second acknowledgment")
    assert len([e for e in reopened.events(rid) if e["kind"] == "coordinator_acknowledged"]) == 1


def test_old_escalated_requests_are_backfilled_without_resetting_acknowledgments(cfg, clock, tmp_path):
    path = str(tmp_path / "old.db")
    d = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    rid = create_approved(d, MEDICAL, "Layla")
    fallback = d.create_request(MEDICAL)
    d.store.x("UPDATE requests SET status='escalated' WHERE id=?", (fallback,))
    clock.t += 17
    d._emit(rid, "no_match", "agent", {"text": "No interpreters available."})
    last_no_match = clock.t
    old = d.snapshot(rid)
    d.store.x("DROP TABLE escalations")  # Database from before the coordinator queue feature.

    reopened = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    assert {item["request_id"] for item in reopened.escalations()} == {rid, fallback}
    snap = reopened.snapshot(rid)
    assert snap["escalation"]["created_at"] == last_no_match
    assert all(snap[k] == old[k] for k in ("token", "status", "message", "requester_name", "appointment", "offers", "events"))
    assert reopened.snapshot(fallback)["escalation"]["created_at"] == reopened.snapshot(fallback)["created_at"]
    clock.t += 5
    ack = reopened.acknowledge(rid, "Checking remote support.")
    reopened_again = Dispatcher(Store(path), LLM(cfg), cfg, clock)
    assert reopened_again.acknowledge(rid, "Should not replace the original note.") == ack
    assert len(reopened_again.escalations()) == 2


def test_telegram_cannot_approve_another_chats_request(d, cfg):
    t = Fake(d, cfg)
    t.init_cursor()
    t.handle(msg(500, MEDICAL))
    t.pump()
    review = next(p for p in t.to(500) if p.get("reply_markup"))
    callback = review["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    t.handle(click(501, callback))
    assert d.latest()["status"] == "reviewing" and not d.latest()["offers"]
    t.handle(click(500, callback))
    assert d.latest()["status"] == "dispatching"


def test_summary_redaction_also_applies_without_a_working_model(d, monkeypatch):
    notes = "Renewal approved. Call 050 123 4567 or email private@example.com."
    summary = build_summary(notes, d.llm)
    assert "[PHONE]" in summary["en"] and "[EMAIL]" in summary["en"]
    monkeypatch.setattr(d.llm, "cfg", replace(d.cfg, llm_provider="openai"))
    seen = []

    def failed_model(_system, text):
        seen.append(text)
        return None

    monkeypatch.setattr(d.llm, "text", failed_model)
    assert build_summary(notes, d.llm) == summary
    assert "050" not in seen[0] and "private@example.com" not in seen[0]


@pytest.mark.parametrize("model_fails", [False, True])
def test_public_request_burst_caps_model_workers_and_falls_back_to_review(d, monkeypatch, model_fails):
    d.llm.cfg = replace(d.cfg, llm_provider="openai")
    admitted = queue.Queue()
    release = threading.Event()
    lock = threading.Lock()
    active = maximum = 0
    workers = []
    thread_type = threading.Thread

    def worker(*args, **kwargs):
        thread = thread_type(*args, **kwargs)
        workers.append(thread)
        return thread

    def slow_model(_text, base, _llm, _now):
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        admitted.put(True)
        assert release.wait(3), "test did not release the model worker"
        with lock:
            active -= 1
        if model_fails:
            raise RuntimeError("model unavailable")
        return base.model_copy(update={"source": "llm"})

    monkeypatch.setattr("ishara.dispatcher.threading.Thread", worker)
    monkeypatch.setattr("ishara.dispatcher.refine_with_llm", slow_model)
    first, second = d.create_request(MEDICAL), d.create_request(MEDICAL)
    try:
        admitted.get(timeout=2)
        admitted.get(timeout=2)
        assert d.snapshot(first)["status"] == d.snapshot(second)["status"] == "parsing"
        overflow = [d.create_request(MEDICAL) for _ in range(4)]
        assert len(workers) == maximum == 2
        for rid in overflow:
            snap = d.snapshot(rid)
            assert snap["status"] == "reviewing" and snap["appointment"]["source"] == "rules"
            assert not snap["offers"]
    finally:
        release.set()
        for thread in workers:
            thread.join(timeout=3)
            assert not thread.is_alive()
    assert d.snapshot(first)["status"] == d.snapshot(second)["status"] == "reviewing"
    after = d.create_request(MEDICAL)
    workers[-1].join(timeout=3)
    assert len(workers) == 3  # Successful and failed model calls both returned their worker slot.
    assert d.snapshot(after)["status"] == "reviewing"
    assert maximum == 2
