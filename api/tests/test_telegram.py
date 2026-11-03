import pytest

from ishara.telegram import Telegram

from .conftest import MEDICAL, create_approved, tokens


class Fake(Telegram):
    def __init__(self, d, cfg):
        super().__init__(d, cfg)
        self.out = []

    def api(self, method, **params):
        self.out.append((method, params))
        return {}

    def to(self, chat):
        return [p for m, p in self.out if m == "sendMessage" and p["chat_id"] == chat]


def msg(chat, text, chat_type="private"):
    return {"update_id": 1, "message": {"chat": {"id": chat, "type": chat_type}, "text": text, "from": {"id": chat, "first_name": "Layla"}}}


def click(chat, data, chat_type="private"):
    return {"update_id": 2, "callback_query": {"id": "q", "data": data, "from": {"id": chat}, "message": {"chat": {"id": chat, "type": chat_type}, "message_id": 9}}}


def test_full_flow_over_telegram(d, cfg):
    t = Fake(d, cfg)
    t.init_cursor()
    by_chat = {}
    for n, i in enumerate(d.interpreters(True)):
        t.handle(msg(100 + n, f"/start {i['token']}"))
        by_chat[i["id"]] = 100 + n
    assert "Linked as" in t.to(100)[0]["text"]

    t.handle(msg(500, MEDICAL))
    t.pump()
    assert any("I read it as" in p["text"] for p in t.to(500))
    review = next(p for p in t.to(500) if p.get("reply_markup"))
    assert not [p for c in by_chat.values() for p in t.to(c) if p.get("reply_markup")]
    t.handle(click(500, review["reply_markup"]["inline_keyboard"][0][0]["callback_data"]))
    t.pump()
    offered = [(c, p) for c in by_chat.values() for p in t.to(c)]
    cards = [(c, p) for c, p in offered if p.get("reply_markup")]
    assert len(cards) == 2
    chat, card = cards[0]
    cb = card["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    t.handle(click(chat, cb))
    t.pump()
    conf = t.to(500)[-1]["text"]
    assert "will interpret" in conf and "تم تأكيد" in conf
    briefing = t.to(chat)[-1]
    assert "Leave by" in briefing["text"]
    cancel_cb = briefing["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    assert cancel_cb.startswith("c:")

    t.handle(click(chat, cancel_cb))
    t.pump()
    assert "replacement" in t.to(500)[-1]["text"]
    promoted = [p for c in by_chat.values() if c != chat for p in t.to(c) if p.get("reply_markup") and "New request" in p["text"]]
    assert any("a:3" in str(x["reply_markup"]) for x in promoted)  # backup got its own offer card


def test_invalid_invite_and_late_click(d, cfg):
    t = Fake(d, cfg)
    t.init_cursor()
    t.handle(msg(1, "/start nope"))
    assert "not valid" in t.to(1)[0]["text"]
    t.handle(click(2, "a:1"))
    assert any(m == "answerCallbackQuery" and "invite" in p["text"] for m, p in t.out)


@pytest.mark.parametrize("chat_type", ["group", "supergroup", "channel"])
def test_group_messages_cannot_create_requests_or_link_interpreters(d, cfg, chat_type):
    t = Fake(d, cfg)
    t.handle(msg(-100, MEDICAL, chat_type))
    token = next(iter(tokens(d).values()))
    t.handle(msg(-100, f"/start {token}", chat_type))
    assert d.latest() is None
    assert d.store.q("SELECT * FROM tg_chats") == []
    assert d.store.q("SELECT * FROM tg_requests") == []
    assert t.out == []


def test_legacy_group_request_cannot_be_approved_or_receive_notifications(d, cfg):
    t = Fake(d, cfg)
    t.init_cursor()
    rid = d.create_request(MEDICAL)
    d.store.x("INSERT INTO tg_requests(request_id, chat_id) VALUES (?,?)", (rid, -100))
    update = click(-100, f"v:{rid}", "supergroup")
    update["callback_query"]["from"]["id"] = 202  # A different member clicked the old button.
    t.handle(update)
    t.pump()
    assert d.snapshot(rid)["status"] == "reviewing"
    assert d.snapshot(rid)["offers"] == []
    assert t.to(-100) == []
    assert all(method == "answerCallbackQuery" for method, _ in t.out)


def test_legacy_group_interpreter_cannot_accept_cancel_or_complete(d, cfg):
    t = Fake(d, cfg)
    t.init_cursor()
    rid = create_approved(d, MEDICAL)
    offer = d.snapshot(rid)["offers"][0]
    token = tokens(d)[offer["interpreter_id"]]
    d.store.x("INSERT INTO tg_chats(chat_id, interpreter_id, awaiting) VALUES (?,?,?)", (-100, offer["interpreter_id"], rid))
    for action in (f"a:{offer['id']}", f"d:{offer['id']}", f"f:{rid}"):
        t.handle(click(-100, action, "group"))
    assert d.snapshot(rid)["status"] == "dispatching"
    assert d.snapshot(rid)["offers"][0]["status"] == "pending"
    d.respond(token, offer["id"], True)
    t.handle(click(-100, f"c:{rid}", "supergroup"))
    t.handle(msg(-100, "Visit complete. Here are the notes.", "supergroup"))
    t.pump()
    assert d.snapshot(rid)["status"] == "confirmed"
    assert d.snapshot(rid)["summary"] is None
    assert t.to(-100) == []
    t.handle(msg(100, f"/start {token}"))
    assert t._chat(-100) is None and t._chat(100)["interpreter_id"] == offer["interpreter_id"]
