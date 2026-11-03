from __future__ import annotations

import logging
import threading
from typing import Optional

import httpx

from .config import Settings
from .dispatcher import Conflict, Dispatcher, NotFound
from .models import ApprovalIn
from .timefmt import fmt

log = logging.getLogger("ishara.telegram")

_WELCOME = (
    "Ishara finds a sign language interpreter for your appointment.\n\n"
    "Forward or paste your appointment message here and I will take it from there."
)


class Telegram:
    """Telegram front door. Reads the event log and talks to people; never decides who gets a job."""

    def __init__(self, d: Dispatcher, cfg: Settings) -> None:
        self.d, self.cfg, self.store = d, cfg, d.store
        self.username = ""
        self._stop = threading.Event()
        self._http = httpx.Client(timeout=40)
        self._base = f"https://api.telegram.org/bot{cfg.telegram_token}"

    @property
    def enabled(self) -> bool:
        return bool(self.cfg.telegram_token)

    # ---- transport ---------------------------------------------------------
    def api(self, method: str, **params):
        try:
            data = self._http.post(f"{self._base}/{method}", json=params).json()
            if not data.get("ok"):
                log.warning("telegram %s failed: %s", method, data.get("description"))
                return None
            return data["result"]
        except Exception as e:
            log.warning("telegram %s error: %s", method, e)
            return None

    def send(self, chat: int, text: str, buttons: Optional[list] = None) -> None:
        if chat <= 0:  # Old group links must never receive private appointment details.
            return
        params = {"chat_id": chat, "text": text}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": [[{"text": t, "callback_data": c} for t, c in buttons]]}
        self.api("sendMessage", **params)

    def start(self) -> None:
        if not self.enabled:
            return
        me = self.api("getMe")
        if not me:
            log.warning("telegram disabled: getMe failed, check TELEGRAM_BOT_TOKEN")
            return
        self.username = me.get("username", "")
        self.api("deleteWebhook")
        self.init_cursor()
        for fn in (self._poll_loop, self._notify_loop):
            threading.Thread(target=fn, daemon=True).start()
        log.info("telegram bot @%s online", self.username)

    def stop(self) -> None:
        self._stop.set()

    def _poll_loop(self) -> None:
        offset = 0
        while not self._stop.is_set():
            updates = self.api("getUpdates", offset=offset, timeout=25, allowed_updates=["message", "callback_query"])
            if updates is None:
                self._stop.wait(3)
                continue
            for u in updates:
                offset = u["update_id"] + 1
                try:
                    self.handle(u)
                except Exception:
                    log.exception("update failed")

    def _notify_loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.pump()
            except Exception:
                log.exception("notify failed")
            self._stop.wait(1)

    # ---- incoming ----------------------------------------------------------
    def handle(self, u: dict) -> None:
        callback = u.get("callback_query")
        message = (callback or {}).get("message") or u.get("message") or {}
        chat = message.get("chat") or {}
        if chat.get("type") != "private" or not isinstance(chat.get("id"), int) or chat["id"] <= 0:
            if callback:
                self.api("answerCallbackQuery", callback_query_id=callback["id"], text="Open a private chat with Ishara to continue.")
            return
        if "callback_query" in u:
            self._callback(u["callback_query"])
        elif u.get("message", {}).get("text"):
            self._message(u["message"])

    def _chat(self, chat: int) -> Optional[dict]:
        return self.store.one("SELECT * FROM tg_chats WHERE chat_id=?", (chat,))

    def _token(self, interpreter_id: str) -> str:
        return next(i["token"] for i in self.d.interpreters(True) if i["id"] == interpreter_id)

    def _message(self, m: dict) -> None:
        chat, text = m["chat"]["id"], m["text"].strip()
        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            return self._link(chat, parts[1] if len(parts) > 1 else "")
        row = self._chat(chat)
        if row and row["interpreter_id"]:
            return self._interpreter_text(chat, row, text)
        if len(text) < 8:
            return self.send(chat, _WELCOME)
        name = (m.get("from") or {}).get("first_name", "")

        def link(rid: str) -> None:  # runs inside the create transaction, before any event is read
            self.store.x("INSERT OR REPLACE INTO tg_requests(request_id, chat_id) VALUES (?,?)", (rid, chat))

        self.d.create_request(text, name, on_create=link)
        self.send(chat, "Got it. I will show the appointment details for you to review before contacting an interpreter.")

    def _link(self, chat: int, arg: str) -> None:
        if not arg:
            return self.send(chat, _WELCOME)
        try:
            me = self.d._by_token(arg.strip())
        except NotFound:
            return self.send(chat, "That invite link is not valid.")
        with self.store.tx():
            self.store.x("DELETE FROM tg_chats WHERE interpreter_id=?", (me["id"],))
            self.store.x("INSERT OR REPLACE INTO tg_chats(chat_id, interpreter_id) VALUES (?,?)", (chat, me["id"]))
        self.send(chat, f"Linked as {me['name']}. Offers for matching appointments will arrive here.")

    def _interpreter_text(self, chat: int, row: dict, text: str) -> None:
        if not row["awaiting"]:
            return self.send(chat, "You will get offers here when an appointment matches you.")
        notes = "" if text == "/skip" else text
        try:
            self.d.complete(self._token(row["interpreter_id"]), row["awaiting"], notes)
        except (Conflict, NotFound) as e:
            self.send(chat, str(e))
        self.store.x("UPDATE tg_chats SET awaiting=NULL WHERE chat_id=?", (chat,))

    def _callback(self, cq: dict) -> None:
        chat = cq["message"]["chat"]["id"]
        row = self._chat(chat)
        answer = "Done"
        kind, _, ref = cq.get("data", "").partition(":")
        if kind == "v":
            linked = self.store.one("SELECT 1 FROM tg_requests WHERE request_id=? AND chat_id=?", (ref, chat))
            try:
                if not linked:
                    raise NotFound("request")
                req = self.d._req(ref)
                details = ApprovalIn(**{k: self.d._appt(req).model_dump()[k] for k in ApprovalIn.model_fields})
                self.d.approve(req["token"], details)
                answer = "Confirmed. Finding an interpreter now."
            except (Conflict, NotFound, ValueError) as e:
                answer = str(e)[:180]
        elif not row or not row["interpreter_id"]:
            answer = "Open your invite link first."
        else:
            token = self._token(row["interpreter_id"])
            try:
                if kind in ("a", "d"):
                    self.d.respond(token, int(ref), kind == "a")
                    answer = "Accepted" if kind == "a" else "Declined"
                elif kind == "c":
                    self.d.cancel(token, ref)
                    answer = "Cancelled. The requester is being rematched."
                elif kind == "f":
                    self.store.x("UPDATE tg_chats SET awaiting=? WHERE chat_id=?", (ref, chat))
                    self.send(chat, "Send the visit notes in one message, or /skip.")
            except (Conflict, NotFound, ValueError) as e:
                answer = str(e)
        self.api("answerCallbackQuery", callback_query_id=cq["id"], text=answer)
        self.api("editMessageReplyMarkup", chat_id=chat, message_id=cq["message"]["message_id"], reply_markup={"inline_keyboard": []})

    # ---- outgoing: one consumer of the append-only event log ---------------
    def init_cursor(self) -> None:
        if not self.store.one("SELECT 1 FROM tg_cursor"):
            self.store.x("INSERT INTO tg_cursor(id, last_event) VALUES (1, ?)", (self.d.latest_event_id(),))

    def pump(self) -> None:
        last = self.store.one("SELECT last_event FROM tg_cursor WHERE id=1")["last_event"]
        for e in self.d.events_after(last):
            try:
                self._notify(e)
            except Exception:
                log.exception("notify event %s failed", e["id"])
            self.store.x("UPDATE tg_cursor SET last_event=? WHERE id=1", (e["id"],))

    def _requester(self, rid: str) -> Optional[int]:
        row = self.store.one("SELECT chat_id FROM tg_requests WHERE request_id=?", (rid,))
        return row["chat_id"] if row else None

    def _interpreter_chat(self, interpreter_id: Optional[str]) -> Optional[int]:
        row = self.store.one("SELECT chat_id FROM tg_chats WHERE interpreter_id=?", (interpreter_id,))
        return row["chat_id"] if row else None

    def _notify(self, e: dict) -> None:
        rid, kind, p = e["request_id"], e["kind"], e["payload"]
        who = self._requester(rid)
        if kind == "parsed" and who:
            a = self.d.snapshot(rid, ops=False)["appointment"]
            self.send(who, p["text"].replace("Read it as", "I read it as", 1) + f"\nDuration: {a['duration_min']} minutes.\nCheck every detail. Confirm only if correct; otherwise send a corrected appointment message.", [("Confirm appointment details", f"v:{rid}")])
        elif kind in ("offered", "backup_promoted"):
            chat = self._interpreter_chat(p.get("interpreter_id"))
            offer = self.store.one("SELECT * FROM offers WHERE request_id=? AND interpreter_id=? AND status='pending'", (rid, p.get("interpreter_id")))
            if chat and offer:
                a = self.d.snapshot(rid, ops=False)["appointment"]
                left = max(0, int(offer["expires_at"] - self.d.clock()))
                self.send(
                    chat,
                    f"New request\n{a['entity']}, {a['area']}\n{fmt(a['starts_at'])} · {a['language']}\n{offer['travel_min']} min from you\nPlease answer within {left} s.",
                    [("Accept", f"a:{offer['id']}"), ("Decline", f"d:{offer['id']}")],
                )
        elif kind == "briefing_sent":
            snap = self.d.snapshot(rid)
            if who and snap["confirmation"]:
                c = snap["confirmation"]
                self.send(who, c["en"] + ("\n\n" + c["ar"] if c["ar"] else ""))
            chat = self._interpreter_chat(snap["assigned"]["id"]) if snap["assigned"] else None
            b = snap.get("briefing")
            if chat and b:
                lines = [f"Confirmed. Leave by {fmt(b['leave_by'])}, arrive by {fmt(b['arrive_by'])}.", "", "Vocabulary: " + ", ".join(b["vocabulary"]), ""] + ["- " + x for x in b["practice"]]
                self.send(chat, "\n".join(lines), [("I cannot attend", f"c:{rid}"), ("Visit done", f"f:{rid}")])
        elif kind == "interpreter_cancelled" and who:
            self.send(who, "Your interpreter can no longer attend. I am finding a replacement now. Your appointment time has not changed.")
        elif kind == "no_match" and who:
            self.send(who, "No qualified interpreter is free right now. Your request is in the coordinator queue and has not been acknowledged yet." + (f"\nRemote video interpreting: {self.cfg.remote_interpreter_url}" if self.cfg.remote_interpreter_url else ""))
        elif kind == "coordinator_acknowledged" and who:
            self.send(who, "A coordinator has acknowledged your request. An interpreter has not been confirmed yet.")
        elif kind == "completed" and who:
            s = self.d.snapshot(rid, ops=False)["summary"]
            if s:
                self.send(who, "Summary of your visit\n\n" + s["en"] + ("\n\n" + s["ar"] if s["ar"] else ""))
