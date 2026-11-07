from fastapi.testclient import TestClient

from ishara.main import create_app

from .conftest import MEDICAL, approve_api


def test_api_flow(cfg):
    with TestClient(create_app(cfg)) as c:
        assert c.get("/api/health").json() == {"ok": True}
        snap = c.post("/api/requests", json={"text": MEDICAL, "requester_name": "Layla"}).json()
        assert snap["status"] == "reviewing" and "offers" not in snap
        assert approve_api(c, snap).json()["status"] == "dispatching"
        snap = c.get(f"/api/requests/{snap['id']}").json()
        tok = {i["id"]: i["token"] for i in c.get("/api/interpreters").json()}
        offer = snap["offers"][0]
        assert c.post(f"/api/i/{tok[offer['interpreter_id']]}/offers/{offer['id']}/accept").json() == {"ok": True}
        assert c.post(f"/api/i/{tok[offer['interpreter_id']]}/offers/{offer['id']}/accept").status_code == 409
        view = c.get(f"/api/r/{snap['token']}").json()
        assert view["status"] == "confirmed" and "offers" not in view
        assert c.get("/api/i/nope").status_code == 404
        assert c.get("/api/requests/latest").json()["id"] == snap["id"]


def test_recent_requests_keeps_older_pending_work_and_excludes_private_links(cfg):
    with TestClient(create_app(cfg)) as c:
        first = c.post("/api/requests", json={"text": MEDICAL, "requester_name": "First"}).json()
        second = c.post("/api/requests", json={"text": MEDICAL, "requester_name": "Second"}).json()
        assert c.get("/api/requests/latest").json()["id"] == second["id"]
        rows = c.get("/api/requests").json()
        assert [row["id"] for row in rows] == [second["id"], first["id"]]
        assert all(row["status"] == "reviewing" for row in rows)
        assert all(set(row) == {"id", "created_at", "status", "requester_name", "appointment"} for row in rows)
        assert c.get(f"/api/requests/{first['id']}").json()["id"] == first["id"]


def test_archiving_persists_without_changing_booking_or_support(cfg, tmp_path):
    from dataclasses import replace

    cfg = replace(cfg, db_path=str(tmp_path / "archive.db"))
    app = create_app(cfg)
    with TestClient(app) as c:
        snap = c.post("/api/requests", json={"text": MEDICAL}).json()
        assert approve_api(c, snap).status_code == 200
        path = f"/api/requests/{snap['id']}/archive"
        for _ in range(2):
            assert c.post(path, json={"archived": True}).status_code == 200
        assert c.get("/api/requests").json() == []
        assert [r["id"] for r in c.get("/api/requests?archived=true").json()] == [snap["id"]]
        view = c.get(f"/api/r/{snap['token']}").json()
        assert view["status"] == "dispatching"
        assert "archive" not in view
        assert len(c.get(f"/api/requests/{snap['id']}").json()["offers"]) > 0
        app.state.dispatcher.store.x("UPDATE requests SET status='escalated' WHERE id=?", (snap["id"],))
        app.state.dispatcher.store.x("INSERT INTO escalations(request_id, created_at) VALUES (?, ?)", (snap["id"], snap["now"]))
        assert c.get("/api/escalations").json()[0]["request_id"] == snap["id"]
    with TestClient(create_app(cfg)) as c:
        assert c.get("/api/requests").json() == []
        assert len(c.get("/api/requests?archived=true").json()) == 1
        assert c.post(path, json={"archived": False}).status_code == 200
        assert c.post(path, json={"archived": False}).status_code == 200
        assert c.get("/api/requests").json()[0]["id"] == snap["id"]
        assert c.get("/api/requests?archived=true").json() == []
        assert c.post("/api/requests/missing/archive", json={"archived": True}).status_code == 404
        for value in ("false", 0, None):
            assert c.post(path, json={"archived": value}).status_code == 422


def test_history_filters_use_dubai_appointment_dates_and_search_all_requests(cfg):
    import json
    from datetime import datetime

    app = create_app(cfg)
    with TestClient(app) as c:
        ids = []
        for name, instant in [("Midnight", "2026-11-11T20:00:00+00:00"), ("Evening", "2026-11-12T19:59:59+00:00"), ("Next day", "2026-11-12T20:00:00+00:00")]:
            snap = c.post("/api/requests", json={"text": MEDICAL, "requester_name": name}).json()
            ids.append(snap["id"])
            appointment = {**snap["appointment"], "starts_at": datetime.fromisoformat(instant).timestamp()}
            app.state.dispatcher.store.x("UPDATE requests SET appointment=? WHERE id=?", (json.dumps(appointment), snap["id"]))
        params = {"date_from": "2026-11-12", "date_to": "2026-11-12", "sort": "soonest", "status": "reviewing", "q": "rashid"}
        assert [r["id"] for r in c.get("/api/requests", params=params).json()] == ids[:2]
        assert [r["id"] for r in c.get("/api/requests", params={**params, "sort": "latest"}).json()] == ids[1::-1]
        assert c.get("/api/requests", params={**params, "q": "EVENING"}).json()[0]["id"] == ids[1]
        assert c.get("/api/requests", params={"q": ids[0]}).json()[0]["id"] == ids[0]
        assert c.get("/api/requests", params={"q": "Oud Metha"}).json()
        assert c.get("/api/requests", params={"q": "%"}).json() == []
        assert c.get("/api/requests", params={"status": "completed"}).json() == []
        for bad in ({"status": "unknown"}, {"sort": "unsafe"}, {"q": "a" * 121}, {"date_from": "bad"}, {"date_from": "2026-11-13", "date_to": "2026-11-12"}):
            assert c.get("/api/requests", params=bad).status_code == 422
        # Old matches remain searchable even after 100 newer non-matching requests.
        for i in range(101):
            app.state.dispatcher.create_request(MEDICAL, f"New resident {i}")
        assert len(c.get("/api/requests").json()) == 100
        assert c.get("/api/requests?q=Midnight").json()[0]["id"] == ids[0]


def test_bulk_archive_is_atomic_and_only_archives_selected_requests(cfg):
    with TestClient(create_app(cfg)) as c:
        requests = [c.post("/api/requests", json={"text": MEDICAL}).json() for _ in range(3)]
        ids = [row["id"] for row in requests]
        path = "/api/requests/archive"
        assert c.post(path, json={"request_ids": [ids[0], "missing"]}).status_code == 404
        assert len(c.get("/api/requests").json()) == 3
        for bad in ([], ids * 34, [""], ["a" * 129], [123]):
            assert c.post(path, json={"request_ids": bad}).status_code == 422
        assert c.post(path, json={"request_ids": ids[:2]}).json() == {"ok": True}
        assert c.post(path, json={"request_ids": ids[:2]}).json() == {"ok": True}
        assert [row["id"] for row in c.get("/api/requests").json()] == ids[2:]
        assert {row["id"] for row in c.get("/api/requests?archived=true").json()} == set(ids[:2])
        assert all(c.get(f"/api/r/{row['token']}").json()["status"] == "reviewing" for row in requests)
