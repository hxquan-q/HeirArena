from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from .agents import Orchestrator, Session, build_session, export_markdown
from .config import get_settings
from .legal import ARTICLE_SHORT, ARTICLES, compute_legal_shares
from .models import CaseInput

app = FastAPI(title="HeirArena 遗产竞技场 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

SESSIONS: dict[str, Session] = {}


class InterjectBody(BaseModel):
    text: str = Field(min_length=1, max_length=200)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/config")
async def config() -> dict:
    s = get_settings()
    return {"mode": s.mode, "model": s.model if s.llm_enabled else "scripted", "base_url": s.base_url if s.llm_enabled else None}


@app.get("/api/articles")
async def articles() -> dict:
    return {"articles": ARTICLES, "short": ARTICLE_SHORT}


@app.post("/api/legal/preview")
async def legal_preview(case: CaseInput) -> dict:
    return compute_legal_shares(case).model_dump()


@app.post("/api/sessions")
async def create_session(case: CaseInput) -> dict:
    if not case.members:
        raise HTTPException(400, "至少需要一位家庭成员")
    if not case.assets:
        raise HTTPException(400, "至少需要一项资产")
    settings = get_settings()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, settings)
    SESSIONS[session.id] = session
    session.task = asyncio.create_task(Orchestrator(session).run())
    return {
        "session_id": session.id, "mode": settings.mode,
        "agents": [a.model_dump() for a in session.specs], "legal": legal.model_dump(),
    }


def _get(session_id: str) -> Session:
    s = SESSIONS.get(session_id)
    if not s:
        raise HTTPException(404, "会话不存在")
    return s


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    s = _get(session_id)
    return {
        "session_id": s.id, "status": s.status, "events": len(s.events), "verdict": s.verdict,
        "agents": [a.model_dump() for a in s.specs], "legal": s.legal.model_dump(), "case": s.case.model_dump(),
    }


@app.get("/api/sessions/{session_id}/stream")
async def stream(session_id: str, from_seq: int = 0) -> StreamingResponse:
    s = _get(session_id)

    async def gen() -> AsyncIterator[str]:
        q: asyncio.Queue = asyncio.Queue()
        s.subscribers.append(q)
        try:
            # 先回放历史事件，再实时推送（对断线重连友好）
            replay = list(s.events[from_seq:])
            for evt in replay:
                yield _sse(evt)
            last = replay[-1]["seq"] if replay else from_seq - 1
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    if s.status in {"done", "error", "cancelled"} and q.empty():
                        break
                    continue
                if evt["seq"] <= last:
                    continue
                last = evt["seq"]
                yield _sse(evt)
                if evt["type"] in {"done", "error"}:
                    break
        finally:
            if q in s.subscribers:
                s.subscribers.remove(q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive",
    })


def _sse(evt: dict) -> str:
    return f"id: {evt['seq']}\nevent: {evt['type']}\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"


@app.post("/api/sessions/{session_id}/interject")
async def interject(session_id: str, body: InterjectBody) -> dict:
    s = _get(session_id)
    if s.status != "running":
        raise HTTPException(409, "听证会已经结束，幽灵也该安息了")
    s.interjections.append(body.text.strip())
    s.emit("ghost", {"text": body.text.strip()})
    return {"ok": True, "queued": len(s.interjections)}


@app.get("/api/sessions/{session_id}/export", response_class=PlainTextResponse)
async def export(session_id: str) -> str:
    return export_markdown(_get(session_id))
