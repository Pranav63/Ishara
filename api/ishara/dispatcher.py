from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from statistics import median
from typing import Callable, Optional

from .briefing import build_briefing, build_summary, confirmation
from .config import Settings
from .db import Store
from .llm import LLM
from .matcher import rank
from .models import Appointment, ApprovalIn
from .parser import parse_rules, refine_with_llm
from .redact import redact
from .timefmt import fmt

log = logging.getLogger("ishara")
_PUBLIC = ("id", "name", "area", "certified", "languages", "domains", "reliability")


class Conflict(Exception):
    pass


class NotFound(Exception):
    pass


class Dispatcher:
    """Event-driven dispatch loop. All state lives in SQLite; `tick()` advances time-based rules."""

    def __init__(self, store: Store, llm: LLM, cfg: Settings, clock: Callable[[], float] = time.time) -> None:
        self.store, self.llm, self.cfg, self.clock = store, llm, cfg, clock
        # shortcut: two model parses per process; use a shared queue before adding API replicas.
        self._parse_slots = threading.BoundedSemaphore(2)

    # ---- reads -------------------------------------------------------------
    def _interpreters(self) -> list:
        rows = self.store.q("SELECT * FROM interpreters")
        for r in rows:
            r["languages"], r["domains"] = json.loads(r["languages"]), json.loads(r["domains"])
            r["certified"], r["available"] = bool(r["certified"]), bool(r["available"])
        return rows

    def _by_token(self, token: str) -> dict:
        row = next((r for r in self._interpreters() if r["token"] == token), None)
        if not row:
            raise NotFound("interpreter")
        return row

    def _req(self, rid: str) -> dict:
        row = self.store.one("SELECT * FROM requests WHERE id=?", (rid,))
        if not row:
            raise NotFound("request")
        return row

    def _appt(self, req: dict) -> Appointment:
        return Appointment(**json.loads(req["appointment"]))

    def _pub(self, interp_id: Optional[str]) -> Optional[dict]:
        i = next((r for r in self._interpreters() if r["id"] == interp_id), None)
        return {k: i[k] for k in _PUBLIC} if i else None

    def _busy(self, rid: str, appt: Appointment) -> set:
        rows = self.store.q(
            "SELECT o.interpreter_id AS iid, r.appointment AS a FROM offers o JOIN requests r ON r.id=o.request_id "
            "WHERE o.status='accepted' AND r.status!='completed' AND r.id!=?",
            (rid,),
        )
        end = appt.starts_at + appt.duration_min * 60
        busy = set()
        for row in rows:
            other = json.loads(row["a"])
            if other["starts_at"] < end and appt.starts_at < other["starts_at"] + other["duration_min"] * 60:
                busy.add(row["iid"])
        return busy

    # ---- writes ------------------------------------------------------------
    def _emit(self, rid: str, kind: str, actor: str, payload: dict) -> None:
        self.store.x(
            "INSERT INTO events(request_id, ts, kind, actor, payload) VALUES (?,?,?,?,?)",
            (rid, self.clock(), kind, actor, json.dumps(payload, ensure_ascii=False)),
        )

    def _set_offer(self, oid: int, status: str) -> None:
        self.store.x("UPDATE offers SET status=?, responded_at=? WHERE id=?", (status, self.clock(), oid))

    def create_request(self, text: str, name: str = "", on_create: Optional[Callable[[str], None]] = None) -> str:
        clean, hidden = redact(text)
        base = parse_rules(clean, self.clock())
        rid, token = "R-" + secrets.token_hex(6).upper(), secrets.token_urlsafe(24)
        with self.store.tx():
            self.store.x(
                "INSERT INTO requests(id, token, created_at, status, raw_text, requester_name, appointment) VALUES (?,?,?,?,?,?,?)",
                (rid, token, self.clock(), "parsing", clean, name.strip(), base.model_dump_json()),
            )
            if on_create:
                on_create(rid)
            note = f" Hid {hidden} personal identifier(s) before processing." if hidden else ""
            self._emit(rid, "received", "requester", {"text": "Message received." + note})
        if self.llm.enabled and self._parse_slots.acquire(blocking=False):
            try:
                threading.Thread(target=self._refine, args=(rid, clean, base), daemon=True).start()
            except RuntimeError:
                self._parse_slots.release()
                log.exception("model worker could not start; using rules")
                self._finish_parse(rid, base)
        else:
            self._finish_parse(rid, base)
        return rid

    def _refine(self, rid: str, text: str, base: Appointment) -> None:
        try:
            try:
                appt = refine_with_llm(text, base, self.llm, self.clock())
            except Exception:
                log.exception("refine failed")
                appt = base
            self._finish_parse(rid, appt)
        finally:
            self._parse_slots.release()

    def _finish_parse(self, rid: str, appt: Appointment) -> None:
        with self.store.tx():
            req = self.store.one("SELECT status FROM requests WHERE id=?", (rid,))
            if not req or req["status"] != "parsing":
                return
            self.store.x("UPDATE requests SET appointment=?, status='reviewing' WHERE id=?", (appt.model_dump_json(), rid))
            guess = f" Assumed: {', '.join(appt.assumed)}." if appt.assumed else ""
            self._emit(
                rid, "parsed", "agent",
                {"text": f"Read it as {appt.domain} at {appt.entity}, {appt.area}, {fmt(appt.starts_at)}, needs {appt.language}.{guess}", "source": appt.source},
            )
            self._emit(rid, "review_required", "agent", {"text": "Please review the date, time, venue and sign language. No interpreter will be contacted until you confirm."})

    def approve(self, token: str, details: ApprovalIn) -> dict:
        with self.store.tx():
            req = self._requester(token)
            if req["status"] != "reviewing":
                raise Conflict("This request is not waiting for review.")
            if not self.clock() < details.starts_at <= self.clock() + 366 * 86400:
                raise Conflict("Choose an appointment in the future, within the next year.")
            appt = Appointment(**details.model_dump(), source=self._appt(req).source)
            appt.entity = redact(appt.entity)[0]
            self.store.x("UPDATE requests SET appointment=? WHERE id=?", (appt.model_dump_json(), req["id"]))
            self._emit(req["id"], "approved", "requester", {"text": "The requester reviewed and confirmed the appointment details."})
            self._plan(req["id"])
            return self.snapshot(req["id"], ops=False)

    def _plan(self, rid: str) -> None:
        """Offer the slot to the next wave of qualified interpreters. Call inside a transaction."""
        req = self._req(rid)
        appt = self._appt(req)
        seen = {r["interpreter_id"] for r in self.store.q("SELECT interpreter_id FROM offers WHERE request_id=?", (rid,))}
        cands = rank(self._interpreters(), appt, self._busy(rid, appt), seen)
        if not cands:
            self.store.x("UPDATE requests SET status='escalated' WHERE id=?", (rid,))
            self.store.x("INSERT OR IGNORE INTO escalations(request_id, created_at) VALUES (?,?)", (rid, self.clock()))
            self._emit(rid, "no_match", "agent", {"text": "No qualified interpreter is free. Added to the coordinator queue; remote video interpreting is available. A coordinator has not acknowledged this request yet."})
            return
        wave, now = req["wave"] + 1, self.clock()
        for c in cands[: self.cfg.wave_size]:
            self._offer(rid, c, wave, "primary", "pending", now + self.cfg.offer_ttl_s)
            self._emit(rid, "offered", "agent", {"text": f"Offered to {c.interpreter['name']}: {', '.join(c.reasons)}.", "interpreter_id": c.interpreter["id"]})
        self.store.x("UPDATE requests SET status=?, wave=? WHERE id=?", ("replanning" if req["status"] == "replanning" else "dispatching", wave, rid))

    def _offer(self, rid: str, c, wave: int, role: str, status: str, expires: float) -> None:
        self.store.x(
            "INSERT INTO offers(request_id, interpreter_id, role, status, wave, sent_at, expires_at, travel_min, reasons) VALUES (?,?,?,?,?,?,?,?,?)",
            (rid, c.interpreter["id"], role, status, wave, self.clock(), expires, c.travel_min, json.dumps(c.reasons)),
        )

    def respond(self, token: str, offer_id: int, accept: bool) -> None:
        me = self._by_token(token)
        with self.store.tx():
            o = self.store.one("SELECT * FROM offers WHERE id=? AND interpreter_id=?", (offer_id, me["id"]))
            if not o:
                raise NotFound("offer")
            if o["status"] != "pending":
                raise Conflict("This offer is no longer open.")
            if self.clock() >= o["expires_at"]:
                raise Conflict("This offer has expired.")
            rid = o["request_id"]
            req = self._req(rid)
            if req["status"] not in ("dispatching", "replanning") or req["assigned_id"]:
                raise Conflict("This appointment is no longer accepting offers.")
            if not accept:
                self._set_offer(o["id"], "declined")
                self._emit(rid, "declined", f"interpreter:{me['id']}", {"text": f"{me['name']} declined."})
                self._replan_if_idle(rid)
                return
            if me["id"] in self._busy(rid, self._appt(req)):
                raise Conflict("You already have an overlapping appointment.")
            replacing = req["status"] == "replanning"
            self._set_offer(o["id"], "accepted")
            self.store.x("UPDATE requests SET assigned_id=?, status='confirmed' WHERE id=?", (me["id"], rid))
            self._emit(rid, "accepted", f"interpreter:{me['id']}", {"text": f"{me['name']} accepted{' as the replacement' if replacing else ''}."})
            for other in self.store.q("SELECT o.id, i.name FROM offers o JOIN interpreters i ON i.id=o.interpreter_id WHERE o.request_id=? AND o.status='pending'", (rid,)):
                self._set_offer(other["id"], "withdrawn")
                self._emit(rid, "withdrawn", "agent", {"text": f"Withdrew the offer to {other['name']}"})
            appt = self._appt(req)
            self.store.x(
                "UPDATE requests SET briefing=?, confirmation=? WHERE id=?",
                (json.dumps(build_briefing(appt, o["travel_min"])), json.dumps(confirmation(appt, me["name"], replacing), ensure_ascii=False), rid),
            )
            self._emit(rid, "briefing_sent", "agent", {"text": f"Sent {me['name']} a briefing and the requester a confirmation (English and Arabic)."})
            self._reserve_standby(rid, appt)

    def _reserve_standby(self, rid: str, appt: Appointment) -> None:
        seen = {r["interpreter_id"] for r in self.store.q("SELECT interpreter_id FROM offers WHERE request_id=?", (rid,))}
        cands = rank(self._interpreters(), appt, self._busy(rid, appt), seen)
        if cands:
            c = cands[0]
            self._offer(rid, c, 0, "standby", "standby", 0)
            self._emit(rid, "standby_reserved", "agent", {"text": f"Pre-warmed {c.interpreter['name']} as backup, {c.travel_min} min away.", "interpreter_id": c.interpreter["id"]})

    def _replan_if_idle(self, rid: str) -> None:
        req = self._req(rid)
        pending = self.store.one("SELECT 1 FROM offers WHERE request_id=? AND status='pending'", (rid,))
        if not pending and not req["assigned_id"] and req["status"] in ("dispatching", "replanning"):
            self._plan(rid)

    def cancel(self, token: str, rid: str) -> None:
        me = self._by_token(token)
        with self.store.tx():
            req = self._req(rid)
            mine = self.store.one("SELECT * FROM offers WHERE request_id=? AND interpreter_id=? AND status='accepted'", (rid, me["id"]))
            if not mine or req["status"] != "confirmed":
                raise Conflict("You are not assigned to this appointment.")
            self._set_offer(mine["id"], "cancelled")
            self.store.x("DELETE FROM arrivals WHERE request_id=?", (rid,))
            self.store.x("UPDATE requests SET assigned_id=NULL, status='replanning', briefing=NULL, confirmation=NULL WHERE id=?", (rid,))
            self._emit(rid, "interpreter_cancelled", f"interpreter:{me['id']}", {"text": f"{me['name']} can no longer attend."})
            backup = self.store.one("SELECT o.*, i.name FROM offers o JOIN interpreters i ON i.id=o.interpreter_id WHERE o.request_id=? AND o.status='standby'", (rid,))
            if backup and backup["interpreter_id"] in self._busy(rid, self._appt(req)):
                self._set_offer(backup["id"], "withdrawn")
                backup = None
            if backup:
                ttl = max(10, self.cfg.offer_ttl_s // 2)
                self.store.x("UPDATE offers SET role='primary', status='pending', sent_at=?, expires_at=? WHERE id=?", (self.clock(), self.clock() + ttl, backup["id"]))
                self._emit(rid, "backup_promoted", "agent", {"text": f"Backup {backup['name']} was already pre-warmed. Offering the slot now.", "interpreter_id": backup["interpreter_id"]})
            else:
                self._plan(rid)

    def update_arrival(self, token: str, rid: str, minutes: int) -> None:
        me = self._by_token(token)
        with self.store.tx():
            req = self._req(rid)
            if req["assigned_id"] != me["id"] or req["status"] != "confirmed":
                raise Conflict("You are not assigned to this appointment.")
            now = self.clock()
            self.store.x(
                "INSERT INTO arrivals(request_id, interpreter_id, eta, updated_at, arrived) VALUES (?,?,?,?,?) "
                "ON CONFLICT(request_id) DO UPDATE SET interpreter_id=excluded.interpreter_id, "
                "eta=excluded.eta, updated_at=excluded.updated_at, arrived=excluded.arrived",
                (rid, me["id"], now + minutes * 60, now, int(minutes == 0)),
            )
            text = f"{me['name']} has arrived." if minutes == 0 else f"{me['name']} reports an estimated arrival in {minutes} minutes."
            self._emit(rid, "arrival_updated", f"interpreter:{me['id']}", {"text": text})

    def _arrival(self, rid: str) -> Optional[dict]:
        row = self.store.one(
            "SELECT a.eta, a.updated_at, a.arrived FROM arrivals a JOIN requests r ON r.id=a.request_id "
            "WHERE a.request_id=? AND a.interpreter_id=r.assigned_id AND r.status='confirmed'", (rid,),
        )
        if row:
            row["arrived"] = bool(row["arrived"])
        return row

    def complete(self, token: str, rid: str, notes: str) -> None:
        me = self._by_token(token)
        req = self._req(rid)
        if req["assigned_id"] != me["id"] or req["status"] != "confirmed":
            raise Conflict("You are not assigned to this appointment.")
        summary = build_summary(notes, self.llm)  # slow call, outside the lock
        with self.store.tx():
            req = self._req(rid)
            if req["assigned_id"] != me["id"] or req["status"] != "confirmed":
                raise Conflict("Your assignment changed while the summary was being prepared.")
            self.store.x("UPDATE requests SET status='completed', summary=? WHERE id=?", (json.dumps(summary, ensure_ascii=False), rid))
            self.store.x("UPDATE offers SET status='withdrawn' WHERE request_id=? AND status='standby'", (rid,))
            self._emit(rid, "completed", f"interpreter:{me['id']}", {"text": "Visit marked complete. Plain-language summary sent to the requester."})

    def tick(self) -> None:
        """Expire stale offers and move on. Safe to call every second."""
        with self.store.tx():
            due = self.store.q(
                "SELECT o.id, o.request_id, i.name FROM offers o JOIN interpreters i ON i.id=o.interpreter_id WHERE o.status='pending' AND o.expires_at <= ?",
                (self.clock(),),
            )
            for o in due:
                self._set_offer(o["id"], "expired")
                self._emit(o["request_id"], "expired", "system", {"text": f"{o['name']} did not respond in time."})
            for rid in {o["request_id"] for o in due}:
                self._replan_if_idle(rid)

    # ---- views -------------------------------------------------------------
    def events(self, rid: str) -> list:
        return self._decode(self.store.q("SELECT * FROM events WHERE request_id=? ORDER BY id", (rid,)))

    def events_after(self, last: int, requester_rid: Optional[str] = None, interpreter_id: Optional[str] = None) -> list:
        where, args = "id>?", (last,)
        if requester_rid:
            where += " AND request_id=?"
            args += (requester_rid,)
        elif interpreter_id:
            where += " AND request_id IN (SELECT request_id FROM offers WHERE interpreter_id=?)"
            args += (interpreter_id,)
        return self._decode(self.store.q(f"SELECT * FROM events WHERE {where} ORDER BY id LIMIT 200", args))

    def latest_event_id(self) -> int:
        row = self.store.one("SELECT COALESCE(MAX(id), 0) AS m FROM events")
        return row["m"]

    @staticmethod
    def _decode(rows: list) -> list:
        for r in rows:
            r["payload"] = json.loads(r["payload"])
        return rows

    def snapshot(self, rid: str, ops: bool = True) -> dict:
        req = self._req(rid)
        out = {
            "now": self.clock(),
            "id": req["id"],
            "token": req["token"],
            "status": req["status"],
            "created_at": req["created_at"],
            "requester_name": req["requester_name"],
            "message": req["raw_text"],
            "appointment": json.loads(req["appointment"]),
            "assigned": self._pub(req["assigned_id"]),
            "confirmation": json.loads(req["confirmation"]) if req["confirmation"] else None,
            "summary": json.loads(req["summary"]) if req["summary"] else None,
            "arrival": self._arrival(rid),
            "escalation": self.store.one("SELECT status, created_at, acknowledged_at, note FROM escalations WHERE request_id=?", (rid,)),
            # shortcut: one reviewed clip confirms status; use per-request recordings when approved media is available.
            "confirmation_video_url": (self.cfg.confirmation_video_url or None) if req["status"] == "confirmed" else None,
            "remote_interpreter_url": (self.cfg.remote_interpreter_url or None) if req["status"] == "escalated" else None,
        }
        if ops:
            offers = self.store.q("SELECT * FROM offers WHERE request_id=? ORDER BY id", (rid,))
            for o in offers:
                o["reasons"] = json.loads(o["reasons"])
            out.update(offers=offers, briefing=json.loads(req["briefing"]) if req["briefing"] else None, events=self.events(rid))
        return out

    def latest(self) -> Optional[dict]:
        row = self.store.one("SELECT id FROM requests ORDER BY created_at DESC, rowid DESC LIMIT 1")
        return self.snapshot(row["id"]) if row else None

    def recent_requests(self) -> list:
        rows = self.store.q("SELECT id, created_at, status, requester_name, appointment FROM requests ORDER BY created_at DESC, rowid DESC LIMIT 100")
        for row in rows:
            row["appointment"] = json.loads(row["appointment"])
        return rows

    def _requester(self, token: str) -> dict:
        row = self.store.one("SELECT * FROM requests WHERE token=?", (token,))
        if not row:
            raise NotFound("request")
        return row

    def by_requester_token(self, token: str) -> dict:
        return self.snapshot(self._requester(token)["id"], ops=False)

    def escalations(self) -> list:
        return [dict(row, appointment=json.loads(row["appointment"])) for row in self.store.q(
            "SELECT e.*, r.requester_name, r.appointment FROM escalations e JOIN requests r ON r.id=e.request_id ORDER BY e.created_at DESC"
        )]

    def acknowledge(self, rid: str, note: str) -> dict:
        with self.store.tx():
            row = self.store.one("SELECT * FROM escalations WHERE request_id=?", (rid,))
            if not row:
                raise NotFound("escalation")
            if row["status"] != "acknowledged":
                note = redact(note.strip())[0]
                self.store.x("UPDATE escalations SET status='acknowledged', acknowledged_at=?, note=? WHERE request_id=?", (self.clock(), note, rid))
                self._emit(rid, "coordinator_acknowledged", "coordinator", {"text": "A coordinator has acknowledged your request."})
            return self.store.one("SELECT * FROM escalations WHERE request_id=?", (rid,))

    def interpreter_view(self, token: str) -> dict:
        me = self._by_token(token)
        rows = self.store.q(
            "SELECT o.*, r.appointment AS appt, r.status AS rstatus, r.requester_name AS rname, r.briefing AS briefing "
            "FROM offers o JOIN requests r ON r.id=o.request_id "
            "WHERE o.interpreter_id=? AND o.status IN ('pending','accepted','standby') AND r.status!='completed' "
            "ORDER BY o.sent_at DESC LIMIT 20",
            (me["id"],),
        )
        items = []
        for r in rows:
            offer = {k: r[k] for k in ("id", "request_id", "interpreter_id", "role", "status", "wave", "sent_at", "expires_at", "travel_min")}
            offer["reasons"] = json.loads(r["reasons"])
            items.append(
                {
                    "offer": offer,
                    "request": {"id": r["request_id"], "status": r["rstatus"], "appointment": json.loads(r["appt"]), "requester_name": r["rname"]},
                    "briefing": json.loads(r["briefing"]) if r["briefing"] and r["status"] == "accepted" else None,
                    "arrival": self._arrival(r["request_id"]) if r["status"] == "accepted" else None,
                }
            )
        return {"now": self.clock(), "interpreter": {k: me[k] for k in _PUBLIC}, "items": items}

    def interpreters(self, with_tokens: bool) -> list:
        out = []
        for i in self._interpreters():
            row = {k: i[k] for k in _PUBLIC}
            if with_tokens:
                row["token"] = i["token"]
            out.append(row)
        return out

    def metrics(self) -> dict:
        reqs = self.store.q("SELECT id, created_at, status FROM requests")
        first = {r["request_id"]: r["ts"] for r in self.store.q("SELECT request_id, MIN(ts) AS ts FROM events WHERE kind='accepted' GROUP BY request_id")}
        times = [first[r["id"]] - r["created_at"] for r in reqs if r["id"] in first]
        cancels = self.store.one("SELECT COUNT(*) AS n FROM events WHERE kind='interpreter_cancelled'")["n"]
        return {
            "requests": len(reqs),
            "filled": sum(1 for r in reqs if r["status"] in ("confirmed", "completed")),
            "median_confirm_s": round(median(times), 1) if times else None,
            "replans": cancels,
        }

    def reset(self) -> None:
        with self.store.tx():
            self.store.x("DELETE FROM requests")
