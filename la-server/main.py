import asyncio
import hashlib
import json
import os
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

AnnouncementRole = Literal["admin", "viewer", "public"]
SignalKind = Literal["offer", "answer", "ice"]
SignalFrom = Literal["admin", "viewer"]

HEARTBEAT_MS = 3000


@dataclass
class SessionState:
    active: bool = False
    session_id: str | None = None
    mime_type: str = "audio/webm;codecs=opus"
    started_at: int = 0


@dataclass
class ViewerState:
    joined_at: int


@dataclass
class Subscriber:
  role: AnnouncementRole
  viewer_id: str | None
  queue: asyncio.Queue[str]


session = SessionState()
viewers: dict[str, ViewerState] = {}
subscribers: list[Subscriber] = []
state_lock = asyncio.Lock()


def now_ms() -> int:
    return int(time.time() * 1000)


def _announcement_token() -> str:
    return os.getenv("ANNOUNCEMENT_ADMIN_TOKEN", "")


def is_authorized_announcement_token(input_token: Any) -> bool:
    admin_token = _announcement_token()
    if not admin_token:
        return True

    incoming = str(input_token or "")
    incoming_hash = hashlib.sha256(incoming.encode("utf-8")).digest()
    expected_hash = hashlib.sha256(admin_token.encode("utf-8")).digest()
    return secrets.compare_digest(incoming_hash, expected_hash)


def encode_sse(event_name: str, payload: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def push_subscriber(subscriber: Subscriber, event_name: str, payload: dict[str, Any]) -> None:
    await subscriber.queue.put(encode_sse(event_name, payload))


async def broadcast(event_name: str, payload: dict[str, Any]) -> None:
    for sub in subscribers[:]:
        await push_subscriber(sub, event_name, payload)


async def broadcast_to_admins(event_name: str, payload: dict[str, Any]) -> None:
    for sub in subscribers[:]:
        if sub.role == "admin":
            await push_subscriber(sub, event_name, payload)


async def broadcast_to_viewer(viewer_id: str, event_name: str, payload: dict[str, Any]) -> None:
    for sub in subscribers[:]:
        if sub.role == "viewer" and sub.viewer_id == viewer_id:
            await push_subscriber(sub, event_name, payload)


def session_snapshot() -> dict[str, Any]:
    return {
        "active": session.active,
        "sessionId": session.session_id,
        "mimeType": session.mime_type,
        "startedAt": session.started_at,
        "viewerCount": len(viewers),
    }


async def heartbeat_loop() -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_MS / 1000)
        async with state_lock:
            payload = {
                "ts": now_ms(),
                "active": session.active,
                "sessionId": session.session_id,
            }
        await broadcast("heartbeat", payload)


app = FastAPI(title="LA Server", version="1.0.0")

allowed_origins_raw = os.getenv("LA_ALLOWED_ORIGINS", "*").strip()
allowed_origins = ["*"] if allowed_origins_raw == "*" else [part.strip() for part in allowed_origins_raw.split(",") if part.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    asyncio.create_task(heartbeat_loop())


@app.get("/health")
async def health() -> dict[str, Any]:
    async with state_lock:
        return {"ok": True, **session_snapshot()}


@app.get("/api/announcement/stream")
async def stream(request: Request, role: str = "public", viewerId: str = "") -> StreamingResponse:
    parsed_role: AnnouncementRole = "public"
    if role in ("admin", "viewer", "public"):
        parsed_role = role
    normalized_viewer_id = viewerId.strip() if parsed_role == "viewer" else ""

    queue: asyncio.Queue[str] = asyncio.Queue()
    subscriber = Subscriber(
        role=parsed_role,
        viewer_id=normalized_viewer_id or None,
        queue=queue,
    )

    async with state_lock:
        subscribers.append(subscriber)
        await queue.put("retry: 800\n: connected\n\n")
        if session.active and session.session_id:
            await queue.put(
                encode_sse(
                    "session_start",
                    {
                        "sessionId": session.session_id,
                        "mimeType": session.mime_type,
                        "startedAt": session.started_at,
                    },
                )
            )
            if subscriber.role == "admin":
                for current_viewer_id, viewer_state in viewers.items():
                    await queue.put(
                        encode_sse(
                            "viewer_joined",
                            {
                                "sessionId": session.session_id,
                                "viewerId": current_viewer_id,
                                "joinedAt": viewer_state.joined_at,
                            },
                        )
                    )

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                item = await queue.get()
                yield item
        finally:
            async with state_lock:
                if subscriber in subscribers:
                    subscribers.remove(subscriber)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/announcement/session/start")
async def start_session(request: Request) -> JSONResponse:
    body = await request.json()
    token = body.get("token")
    mime_type = str(body.get("mimeType") or "audio/webm;codecs=opus")

    if not is_authorized_announcement_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized token")

    async with state_lock:
        if session.active:
            return JSONResponse(
                {
                    "error": "Announcement already active",
                    "reason": "busy",
                    "snapshot": session_snapshot(),
                },
                status_code=409,
            )

        session.active = True
        session.session_id = str(uuid.uuid4())
        session.mime_type = mime_type
        session.started_at = now_ms()
        viewers.clear()
        payload = {
            "sessionId": session.session_id,
            "mimeType": session.mime_type,
            "startedAt": session.started_at,
        }

    await broadcast("session_start", payload)
    return JSONResponse({"ok": True, "sessionId": payload["sessionId"], "mimeType": payload["mimeType"]})


@app.post("/api/announcement/session/stop")
async def stop_session(request: Request) -> JSONResponse:
    body = await request.json()
    token = body.get("token")
    request_session_id = body.get("sessionId")

    if not is_authorized_announcement_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized token")

    async with state_lock:
        if not session.active or not session.session_id:
            return JSONResponse({"ok": True, "alreadyStopped": True})

        if request_session_id and request_session_id != session.session_id:
            return JSONResponse({"error": "Session mismatch", "reason": "session_mismatch"}, status_code=409)

        previous_session_id = session.session_id
        session.active = False
        session.session_id = None
        session.mime_type = "audio/webm;codecs=opus"
        session.started_at = 0
        viewers.clear()

    await broadcast("session_stop", {"sessionId": previous_session_id, "reason": "manual"})
    return JSONResponse({"ok": True})


@app.post("/api/announcement/session/join")
async def join_viewer(request: Request) -> JSONResponse:
    body = await request.json()
    viewer_id = str(body.get("viewerId") or "").strip()

    if not viewer_id:
        return JSONResponse({"error": "viewerId is required"}, status_code=400)

    async with state_lock:
        if not session.active or not session.session_id:
            return JSONResponse({"error": "Viewer join failed", "reason": "no_active_session"}, status_code=409)

        created = viewer_id not in viewers
        viewers[viewer_id] = ViewerState(joined_at=now_ms())
        payload = {
            "sessionId": session.session_id,
            "viewerId": viewer_id,
            "joinedAt": viewers[viewer_id].joined_at,
        }
        response_payload = {"ok": True, "sessionId": session.session_id, "mimeType": session.mime_type}

    if created:
        await broadcast_to_admins("viewer_joined", payload)
    return JSONResponse(response_payload)


@app.post("/api/announcement/session/leave")
async def leave_viewer(request: Request) -> JSONResponse:
    body = await request.json()
    viewer_id = str(body.get("viewerId") or "").strip()
    if not viewer_id:
        return JSONResponse({"error": "viewerId is required"}, status_code=400)

    async with state_lock:
        existed = viewer_id in viewers
        if existed:
            del viewers[viewer_id]
        active = session.active and bool(session.session_id)
        current_session_id = session.session_id

    if existed and active and current_session_id:
        await broadcast_to_admins(
            "viewer_left",
            {"sessionId": current_session_id, "viewerId": viewer_id, "reason": "leave"},
        )
    return JSONResponse({"ok": True})


@app.post("/api/announcement/session/signal")
async def relay_signal(request: Request) -> JSONResponse:
    body = await request.json()
    from_value = body.get("from")
    kind = body.get("kind")
    viewer_id = str(body.get("viewerId") or "").strip()
    request_session_id = body.get("sessionId")
    sdp = body.get("sdp")
    candidate = body.get("candidate")

    if from_value not in ("admin", "viewer"):
        return JSONResponse({"error": "Invalid from"}, status_code=400)
    if kind not in ("offer", "answer", "ice"):
        return JSONResponse({"error": "Invalid kind"}, status_code=400)
    if not viewer_id:
        return JSONResponse({"error": "viewerId is required"}, status_code=400)
    if from_value == "admin" and not is_authorized_announcement_token(body.get("token")):
        raise HTTPException(status_code=401, detail="Unauthorized token")

    async with state_lock:
        if not session.active or not session.session_id:
            return JSONResponse({"error": "Signal rejected", "reason": "no_active_session"}, status_code=409)
        if request_session_id and request_session_id != session.session_id:
            return JSONResponse({"error": "Signal rejected", "reason": "session_mismatch"}, status_code=409)
        if viewer_id not in viewers:
            return JSONResponse({"error": "Signal rejected", "reason": "viewer_not_found"}, status_code=409)
        if kind in ("offer", "answer") and not str(sdp or "").strip():
            return JSONResponse({"error": "Signal rejected", "reason": "invalid_sdp"}, status_code=400)

        payload: dict[str, Any] = {
            "sessionId": session.session_id,
            "viewerId": viewer_id,
            "kind": kind,
            "from": from_value,
        }
        if kind in ("offer", "answer"):
            payload["sdp"] = str(sdp or "")
        if kind == "ice":
            payload["candidate"] = candidate if candidate is not None else None
        current_session_id = session.session_id

    if from_value == "admin":
        await broadcast_to_viewer(viewer_id, "signal", payload)
    else:
        await broadcast_to_admins("signal", payload)

    return JSONResponse({"ok": True, "sessionId": current_session_id})
