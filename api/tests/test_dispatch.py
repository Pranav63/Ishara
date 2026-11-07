import pytest

from ishara.dispatcher import Conflict

from .conftest import GOV, MEDICAL, create_approved, tokens


def offers(d, rid, status):
    return [o for o in d.snapshot(rid)["offers"] if o["status"] == status]


def test_happy_path_confirms_and_prewarms_backup(d):
    rid = create_approved(d, MEDICAL, "Layla")
    snap = d.snapshot(rid)
    assert snap["status"] == "dispatching" and len(offers(d, rid, "pending")) == 2
    first = offers(d, rid, "pending")[0]
    me = next(i for i in d.interpreters(True) if i["id"] == first["interpreter_id"])
    d.respond(me["token"], first["id"], True)
    snap = d.snapshot(rid)
    assert snap["status"] == "confirmed" and snap["assigned"]["id"] == me["id"]
    assert len(offers(d, rid, "withdrawn")) == 1
    assert len(offers(d, rid, "standby")) == 1
    assert snap["briefing"]["vocabulary"] and me["name"] in snap["confirmation"]["en"]
    assert "Hid 1" in snap["events"][0]["payload"]["text"]  # phone number was redacted


def test_declines_roll_to_next_wave_then_escalate(d):
    rid = create_approved(d, MEDICAL)
    t = tokens(d)
    for _ in range(3):  # 4 eligible interpreters: two waves of two
        for o in offers(d, rid, "pending"):
            d.respond(t[o["interpreter_id"]], o["id"], False)
    assert d.snapshot(rid)["status"] == "escalated"


def test_expiry_advances_wave(d, clock):
    rid = create_approved(d, MEDICAL)
    clock.t += 31
    d.tick()
    snap = d.snapshot(rid)
    assert len(offers(d, rid, "expired")) == 2 and len(offers(d, rid, "pending")) == 2 and snap["status"] == "dispatching"


def test_late_response_is_rejected(d, clock):
    rid = create_approved(d, MEDICAL)
    o = offers(d, rid, "pending")[0]
    clock.t += 31
    with pytest.raises(Conflict):
        d.respond(tokens(d)[o["interpreter_id"]], o["id"], True)


def test_cancel_promotes_prewarmed_backup(d):
    rid = create_approved(d, MEDICAL)
    t = tokens(d)
    first = offers(d, rid, "pending")[0]
    d.respond(t[first["interpreter_id"]], first["id"], True)
    backup_id = offers(d, rid, "standby")[0]["interpreter_id"]
    d.cancel(t[first["interpreter_id"]], rid)
    snap = d.snapshot(rid)
    assert snap["status"] == "replanning" and snap["assigned"] is None
    promoted = offers(d, rid, "pending")[0]
    assert promoted["interpreter_id"] == backup_id
    d.respond(t[backup_id], promoted["id"], True)
    snap = d.snapshot(rid)
    assert snap["status"] == "confirmed" and snap["assigned"]["id"] == backup_id
    assert "replacement" in snap["confirmation"]["en"]
    assert d.metrics()["replans"] == 1


def test_complete_stores_summary(d):
    rid = create_approved(d, GOV)
    t = tokens(d)
    o = offers(d, rid, "pending")[0]
    d.respond(t[o["interpreter_id"]], o["id"], True)
    d.complete(t[o["interpreter_id"]], rid, "Renewal approved. Pick up the card in 3 days.")
    snap = d.snapshot(rid)
    assert snap["status"] == "completed" and "Renewal approved" in snap["summary"]["en"]


def test_assigned_interpreter_is_not_double_booked(d):
    first = create_approved(d, MEDICAL)
    t = tokens(d)
    o = offers(d, first, "pending")[0]
    d.respond(t[o["interpreter_id"]], o["id"], True)
    second = create_approved(d, MEDICAL)
    assert o["interpreter_id"] not in {x["interpreter_id"] for x in d.snapshot(second)["offers"]}


def test_metrics_time_to_confirm(d, clock):
    rid = create_approved(d, MEDICAL)
    clock.t += 7
    o = offers(d, rid, "pending")[0]
    d.respond(tokens(d)[o["interpreter_id"]], o["id"], True)
    m = d.metrics()
    assert m["filled"] == 1 and m["median_confirm_s"] == 7.0


def test_simultaneous_acceptances_confirm_exactly_one_interpreter(d):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    rid = create_approved(d, MEDICAL)
    pending = offers(d, rid, "pending")
    roster = tokens(d)
    ready = Barrier(2)

    def accept(offer):
        ready.wait()
        try:
            d.respond(roster[offer["interpreter_id"]], offer["id"], True)
            return "accepted"
        except Conflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(accept, pending[:2])) == ["accepted", "conflict"]
    assert len(offers(d, rid, "accepted")) == 1
    assert len(offers(d, rid, "withdrawn")) == 1
