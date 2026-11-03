from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .config import Settings
from .db import Store
from .dispatcher import Conflict, Dispatcher, NotFound
from .llm import LLM
from .models import AcknowledgeIn, ApprovalIn, ArrivalIn, CompleteIn, OperatorLoginIn, RequestIn
from .places import PLACES
from .seed import seed
from .telegram import Telegram

log = logging.getLogger("ishara")
# Any localhost or private-network origin, so the demo works from a phone on the same Wi-Fi.
_LOCAL_ORIGINS = r"https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?"


def create_app(cfg: Optional[Settings] = None) -> FastAPI:
    cfg = cfg or Settings.load()
    if not cfg.demo_mode and len(cfg.operator_key) < 32:
        raise ValueError("Set ISHARA_OPERATOR_KEY to at least 32 random characters outside DEMO_MODE.")
    store = Store(cfg.db_path)
    if cfg.demo_mode:
        seed(store)
    llm = LLM(cfg)
    d = Dispatcher(store, llm, cfg)
    tg = Telegram(d, cfg)

    async def ticker() -> None:
        while True:
            try:
                await asyncio.to_thread(d.tick)
            except Exception:
                log.exception("tick failed")
            await asyncio.sleep(1)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        task = asyncio.create_task(ticker())
        await asyncio.to_thread(tg.start)
        yield
        tg.stop()
        task.cancel()

    app = FastAPI(title="Ishara API", lifespan=lifespan)
    app.state.dispatcher = d
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_origin_regex=_LOCAL_ORIGINS if cfg.demo_mode and not cfg.operator_key else None, allow_credentials=True, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "Last-Event-ID", "X-Operator-Key"])

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    def signature(expires: str) -> str:
        return hmac.new(cfg.operator_key.encode(), expires.encode(), hashlib.sha256).hexdigest()

    def authenticated(request: Request) -> bool:
        if cfg.demo_mode and not cfg.operator_key:
            return True
        key = request.headers.get("x-operator-key", "")
        if key and secrets.compare_digest(key.encode(), cfg.operator_key.encode()):
            return True
        expires, _, signed = request.cookies.get("ishara_operator", "").partition(".")
        return bool(expires.isascii() and expires.isdigit() and len(expires) <= 12 and int(expires) > time.time() and secrets.compare_digest(signed.encode(), signature(expires).encode()))

    def operator(request: Request) -> None:
        if not authenticated(request):
            raise HTTPException(401, "Operator sign-in required.")

    @app.get("/api/operator/session")
    def operator_session(request: Request) -> dict:
        return {"authenticated": authenticated(request), "demo": cfg.demo_mode}

    @app.post("/api/operator/session")
    def login(body: OperatorLoginIn, response: Response) -> dict:
        if not cfg.operator_key or not secrets.compare_digest(body.key.encode(), cfg.operator_key.encode()):
            raise HTTPException(401, "Invalid operator key.")
        expires = str(int(time.time()) + 12 * 3600)
        response.set_cookie("ishara_operator", f"{expires}.{signature(expires)}", max_age=12 * 3600, httponly=True, secure=cfg.operator_cookie_secure, samesite="lax", path="/api")
        return {"authenticated": True, "demo": cfg.demo_mode}

    @app.delete("/api/operator/session")
    def logout(response: Response) -> dict:
        response.delete_cookie("ishara_operator", path="/api")
        return {"ok": True}

    @app.exception_handler(NotFound)
    async def _nf(_: Request, e: NotFound) -> JSONResponse:
        return JSONResponse({"detail": f"{e} not found"}, status_code=404)

    @app.exception_handler(Conflict)
    async def _conflict(_: Request, e: Conflict) -> JSONResponse:
        return JSONResponse({"detail": str(e)}, status_code=409)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/config")
    def config() -> dict:
        return {"llm": llm.label, "offer_ttl_s": cfg.offer_ttl_s, "demo": cfg.demo_mode, "telegram": tg.username or None, "operator_auth_required": not cfg.demo_mode or bool(cfg.operator_key)}

    @app.get("/api/interpreters", dependencies=[Depends(operator)])
    def interpreters() -> list:
        rows = d.interpreters(with_tokens=True)
        if tg.username:
            for r in rows:
                if "token" in r:
                    r["tg_link"] = f"https://t.me/{tg.username}?start={r['token']}"
        return rows

    @app.get("/api/places")
    def places() -> dict:
        return PLACES

    @app.get("/api/metrics", dependencies=[Depends(operator)])
    def metrics() -> dict:
        return d.metrics()

    @app.post("/api/requests")
    def create(body: RequestIn) -> dict:
        return d.snapshot(d.create_request(body.text, body.requester_name), ops=False)

    @app.get("/api/requests/latest", dependencies=[Depends(operator)])
    def latest() -> Optional[dict]:
        return d.latest()

    @app.get("/api/requests/{rid}", dependencies=[Depends(operator)])
    def get_request(rid: str) -> dict:
        return d.snapshot(rid)

    @app.get("/api/r/{token}")
    def requester(token: str) -> dict:
        return d.by_requester_token(token)

    @app.post("/api/r/{token}/approve")
    def approve(token: str, body: ApprovalIn) -> dict:
        return d.approve(token, body)

    @app.get("/api/escalations", dependencies=[Depends(operator)])
    def escalations() -> list:
        return d.escalations()

    @app.post("/api/escalations/{rid}/acknowledge", dependencies=[Depends(operator)])
    def acknowledge(rid: str, body: AcknowledgeIn) -> dict:
        return d.acknowledge(rid, body.note)

    @app.get("/api/i/{token}")
    def interpreter(token: str) -> dict:
        return d.interpreter_view(token)

    @app.post("/api/i/{token}/offers/{oid}/accept")
    def accept(token: str, oid: int) -> dict:
        d.respond(token, oid, True)
        return {"ok": True}

    @app.post("/api/i/{token}/offers/{oid}/decline")
    def decline(token: str, oid: int) -> dict:
        d.respond(token, oid, False)
        return {"ok": True}

    @app.post("/api/i/{token}/requests/{rid}/cancel")
    def cancel(token: str, rid: str) -> dict:
        d.cancel(token, rid)
        return {"ok": True}

    @app.post("/api/i/{token}/requests/{rid}/complete")
    def complete(token: str, rid: str, body: CompleteIn) -> dict:
        d.complete(token, rid, body.notes)
        return {"ok": True}

    @app.post("/api/i/{token}/requests/{rid}/arrival")
    def arrival(token: str, rid: str, body: ArrivalIn) -> dict:
        d.update_arrival(token, rid, body.minutes)
        return {"ok": True}

    @app.post("/api/demo/reset", dependencies=[Depends(operator)])
    def reset() -> dict:
        if not cfg.demo_mode:
            raise HTTPException(403, "Demo mode is off.")
        d.reset()
        return {"ok": True}

    @app.get("/api/stream")
    async def stream(request: Request, after: Optional[int] = Query(None, ge=0, le=2**63 - 1), requester_token: Optional[str] = None, interpreter_token: Optional[str] = None) -> StreamingResponse:
        if requester_token is not None and interpreter_token is not None:
            raise HTTPException(422, "Choose one event-stream identity.")
        rid = d._requester(requester_token)["id"] if requester_token is not None else None
        iid = d._by_token(interpreter_token)["id"] if interpreter_token is not None else None
        if rid is None and iid is None:
            operator(request)
        last_header = request.headers.get("last-event-id")
        if last_header is not None and (not last_header.isascii() or not last_header.isdigit() or len(last_header) > 19 or int(last_header) > 2**63 - 1):
            raise HTTPException(422, "Last-Event-ID must be a nonnegative 64-bit integer.")
        newest = await asyncio.to_thread(d.latest_event_id)
        last = min(int(last_header) if last_header is not None else (after if after is not None else newest), newest)

        async def gen():
            nonlocal last
            yield "retry: 1500\n\n"
            idle = 0
            while not await request.is_disconnected():
                rows = await asyncio.to_thread(d.events_after, last, rid, iid)
                for r in rows:
                    last = r["id"]
                    if rid is not None or iid is not None:
                        r = {k: r[k] for k in ("id", "request_id", "ts", "kind")}
                    yield f"id: {last}\ndata: {json.dumps(r, ensure_ascii=False)}\n\n"
                idle = 0 if rows else idle + 1
                if idle and idle % 35 == 0:
                    yield ": ping\n\n"
                await asyncio.sleep(0.4)

        return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return app
