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
