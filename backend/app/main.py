from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from pydantic import BaseModel, ConfigDict, Field

from .agents import Orchestrator, Session, build_session, export_markdown
from .agents.court_graph import register_orchestrator, set_checkpointer
from .agents.llm import LLMClient, LLMError
from .seat.advisor import AdvisorUnavailable, build_strategy
from .agents.restore import rebuild_orchestrator, rebuild_session, role_bindings_from_orch
from .case_parser import CaseParseError, CaseParseRequest, parse_case_document
from .config import get_settings
from .legal import ARTICLE_SHORT, ARTICLES, compute_legal_shares
from .models import CaseInput, CourtEvidence, ModelRef
from .persist import init_engine, list_resumable_case_ids, persist_enabled, save_role_bindings, update_status
from .seat import adjudicated_case, analyze, infer_goals, option_for
from .providers import PRESETS, ProviderStore, ProviderUpsert, to_public

SESSIONS: dict[str, Session] = {}
ORCHESTRATORS: dict[str, Orchestrator] = {}
PROVIDERS = ProviderStore()
_CHECKPOINT_CONN: aiosqlite.Connection | None = None


async def _setup_runtime() -> None:
    global _CHECKPOINT_CONN
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    init_engine(settings.database_url)
    _CHECKPOINT_CONN = await aiosqlite.connect(str(settings.checkpoint_path))
    saver = AsyncSqliteSaver(_CHECKPOINT_CONN)
    await saver.setup()
    set_checkpointer(saver)
    for session_id in list_resumable_case_ids():
        try:
            session, extras = rebuild_session(session_id, settings, PROVIDERS)
            orch = rebuild_orchestrator(session, extras)
            SESSIONS[session.id] = session
            ORCHESTRATORS[session.id] = orch
            register_orchestrator(orch)
            if _should_autoresume(session):
                session.task = _spawn(orch, resume=True)
        except Exception as e:  # noqa: BLE001
            print(f"[heirarena] 续庭失败 {session_id}: {e!r}")


async def _teardown_runtime() -> None:
    global _CHECKPOINT_CONN
    if _CHECKPOINT_CONN is not None:
        await _CHECKPOINT_CONN.close()
        _CHECKPOINT_CONN = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await _setup_runtime()
    yield
    await _teardown_runtime()


app = FastAPI(title="HeirArena 遗产竞技场 API", version="0.3.0", lifespan=lifespan)
_CORS_ORIGINS = list(get_settings().cors_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterjectBody(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class SeatBody(BaseModel):
    human: bool


class SpeakMeta(BaseModel):
    action: str | None = None
    target: str | None = None
    claims: dict[str, float] | None = None
    admissions: list[str] = Field(default_factory=list)


class SpeakBody(BaseModel):
    text: str | None = Field(default=None, max_length=500)
    meta: SpeakMeta | None = None
    delegate: bool = False


class EvidenceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_key: str = Field(min_length=3, max_length=120)
    evidence_type: str = Field(min_length=2, max_length=120)
    note: str = Field(min_length=2, max_length=240)


class TestBody(BaseModel):
    model: str | None = None


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/config")
async def config() -> dict:
    s = get_settings()
    ready = [p for p, _src in PROVIDERS.list(s) if p.ready]
    env = ProviderStore.env_provider(s)
    default = {"provider_id": "env", "model": s.model} if env else None
    return {
        "mode": "llm" if ready else "mock",
        "model": f"{env.name} · {s.model}" if env else "scripted",
        "providers_ready": len(ready),
        "default_model": default,
    }


# ------------------------------------------------------------------ providers
@app.get("/api/providers")
async def list_providers() -> dict:
    s = get_settings()
    return {
        "providers": [to_public(p, src).model_dump() for p, src in PROVIDERS.list(s)],
        "presets": [p.model_dump() for p in PRESETS],
    }


@app.post("/api/providers")
async def create_provider(body: ProviderUpsert) -> dict:
    p = PROVIDERS.upsert(None, body, get_settings())
    return to_public(p).model_dump()


@app.put("/api/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpsert) -> dict:
    p = PROVIDERS.upsert(provider_id, body, get_settings())
    return to_public(p).model_dump()


@app.delete("/api/providers/{provider_id}")
async def delete_provider(provider_id: str) -> dict:
    if not PROVIDERS.delete(provider_id):
        raise HTTPException(404, "供应商不存在（.env 里的默认供应商无法删除，请修改 .env）")
    return {"ok": True}


@app.post("/api/providers/{provider_id}/test")
async def test_provider(provider_id: str, body: TestBody) -> dict:
    s = get_settings()
    p = PROVIDERS.get(provider_id, s)
    if not p:
        raise HTTPException(404, "供应商不存在")
    model = body.model or (p.models[0] if p.models else "")
    if not model:
        raise HTTPException(400, "请先填写至少一个模型名，或先拉取模型列表")
    client = LLMClient(p.base_url, p.api_key, model, timeout=min(s.timeout, 30))
    try:
        return await client.ping()
    except LLMError as e:
        return {"ok": False, "error": str(e)[:300], "model": model}


@app.post("/api/providers/{provider_id}/models")
async def fetch_models(provider_id: str) -> dict:
    s = get_settings()
    p = PROVIDERS.get(provider_id, s)
    if not p:
        raise HTTPException(404, "供应商不存在")
    client = LLMClient(p.base_url, p.api_key, "", timeout=min(s.timeout, 20))
    try:
        models = await client.list_models()
    except LLMError as e:
        raise HTTPException(502, str(e)[:300]) from e
    if not models:
        raise HTTPException(502, "接口返回了空的模型列表，请手动填写模型名")
    merged = list(dict.fromkeys([*p.models, *models]))
    saved = PROVIDERS.set_models(provider_id, merged, s)
    return {"models": models, "provider": to_public(saved or p).model_dump()}


def _prepare_seated_case(case: CaseInput) -> CaseInput:
    seat = case.seat
    if seat is None:
        return case
    _validate_ref(seat.advisor_model, "军师")
    if seat.strategy is not None and seat.strategy.player_id != seat.player_id:
        raise HTTPException(400, "策略包的玩家与当前席位不一致")
    if seat.player_id not in seat.goals:
        legal = compute_legal_shares(case)
        goals = dict(seat.goals)
        goals[seat.player_id] = infer_goals(case, seat.player_id, legal)
        case = case.model_copy(update={"seat": seat.model_copy(update={"goals": goals})})
    return case


def _validate_ref(ref: ModelRef | None, who: str) -> None:
    if ref is None or ref.is_mock:
        return
    p = PROVIDERS.get(ref.provider_id, get_settings())
    if not p:
        raise HTTPException(400, f"{who} 指定的供应商「{ref.provider_id}」不存在")
    if not p.ready:
        raise HTTPException(400, f"{who} 指定的供应商「{p.name}」还没有填写 API Key")
    if not (ref.model or p.models):
        raise HTTPException(400, f"{who} 指定的供应商「{p.name}」没有可用模型")


@app.get("/api/articles")
async def articles() -> dict:
    return {"articles": ARTICLES, "short": ARTICLE_SHORT}


@app.post("/api/legal/preview")
async def legal_preview(case: CaseInput) -> dict:
    return compute_legal_shares(case).model_dump()


@app.post("/api/seat/analyze")
async def seat_analyze(case: CaseInput) -> dict:
    if case.seat is None:
        raise HTTPException(422, "缺少席位配置")
    try:
        return analyze(case).model_dump()
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/api/seat/strategy")
async def seat_strategy(case: CaseInput) -> dict:
    if case.seat is None:
        raise HTTPException(422, "缺少席位配置")
    try:
        pack = await build_strategy(case, get_settings(), PROVIDERS)
    except AdvisorUnavailable as error:
        raise HTTPException(502, f"军师不可用：{str(error)[:300]}") from error
    except LLMError as error:
        raise HTTPException(502, f"军师模型调用失败：{str(error)[:300]}") from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return pack.model_dump()


@app.post("/api/cases/parse")
async def parse_case(body: CaseParseRequest) -> dict:
    """用配置好的 OpenAI 兼容模型把 Markdown / 纯文本案情转换为可编辑的 CaseInput 草稿。"""
    try:
        result = await parse_case_document(body, get_settings(), PROVIDERS)
    except CaseParseError as error:
        raise HTTPException(422, str(error)) from error
    except LLMError as error:
        raise HTTPException(502, f"案情解析模型调用失败：{str(error)[:300]}") from error
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(502, f"案情解析模型返回异常：{str(error)[:300]}") from error
    return result.model_dump()


@app.post("/api/sessions")
async def create_session(case: CaseInput) -> dict:
    if not case.members:
        raise HTTPException(400, "至少需要一位家庭成员")
    if not case.assets:
        raise HTTPException(400, "至少需要一项资产")
    _validate_ref(case.default_model, "默认模型")
    _validate_ref(case.executor_model, "遗嘱执行官")
    case = _prepare_seated_case(case)
    for m in case.members:
        _validate_ref(m.model, m.name)
    settings = get_settings()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, settings, PROVIDERS)
    orchestrator = Orchestrator(session)
    SESSIONS[session.id] = session
    ORCHESTRATORS[session.id] = orchestrator
    register_orchestrator(orchestrator)
    if persist_enabled():
        save_role_bindings(session.id, role_bindings_from_orch(orchestrator))
        session.persist_snapshot(orchestrator._extras())
    session.task = _spawn(orchestrator)
    return {
        "session_id": session.id, "mode": "llm" if orchestrator.any_llm else "mock", "model": orchestrator.model_summary,
        "agents": [a.model_dump() for a in session.specs], "legal": legal.model_dump(),
    }


def _should_autoresume(session: Session) -> bool:
    return session.status == "running" and not session.paused


def _release_orch(session_id: str) -> None:
    s = SESSIONS.get(session_id)
    if s is None or s.status in {"done", "error", "cancelled"}:
        ORCHESTRATORS.pop(session_id, None)


def _spawn(orch: Orchestrator, resume: bool = False) -> asyncio.Task:
    """启动庭审任务；终局后释放 ORCHESTRATORS 引用（Session 保留供快照，需要时可重建）。"""
    task = asyncio.create_task(orch.run(resume=resume))
    task.add_done_callback(lambda _t, sid=orch.s.id: _release_orch(sid))
    return task


def _ensure_orch(s: Session) -> Orchestrator:
    orch = ORCHESTRATORS.get(s.id)
    if orch is not None:
        return orch
    extras: dict = {}
    if persist_enabled():
        from .persist import load_case_row

        row = load_case_row(s.id)
        if row is not None:
            extras = json.loads(row.extras_json or "{}")
    orch = rebuild_orchestrator(s, extras)
    ORCHESTRATORS[s.id] = orch
    register_orchestrator(orch)
    return orch


def _apply_speak(s: Session, pending: dict) -> None:
    assert s.seat is not None
    s.seat.pending = pending
    s.status = "running"


def _rollback_speak_claim(
    s: Session, *, status: str, pending: dict | None, task: asyncio.Task | None,
    human: bool, orch: Orchestrator,
) -> None:
    assert s.seat is not None
    s.status = status
    s.seat.pending = pending
    s.seat.human = human
    s.task = task
    try:
        s.persist_snapshot(orch._extras())
    except Exception:
        # 原始持久化故障仍向调用方传播；内存态已恢复，可在存储恢复后重试。
        pass


def _commit_speak_claim(s: Session, pending: dict, *, human: bool | None = None) -> None:
    assert s.seat is not None
    orch = _ensure_orch(s)
    previous_status = s.status
    previous_pending = s.seat.pending
    previous_task = s.task
    previous_human = s.seat.human
    _apply_speak(s, pending)
    if human is not None:
        s.seat.human = human
    try:
        s.persist_snapshot(orch._extras())
        if s.task is None or s.task.done():
            s.task = _spawn(orch, resume=True)
    except Exception:
        _rollback_speak_claim(
            s,
            status=previous_status,
            pending=previous_pending,
            task=previous_task,
            human=previous_human,
            orch=orch,
        )
        raise


def _meta_needs_extract(meta: SpeakMeta | None) -> bool:
    if meta is None:
        return True
    return not {"action", "target", "claims"}.issubset(meta.model_fields_set)


async def _prepare_pending(s: Session, body: SpeakBody) -> dict:
    if s.seat is None:
        raise HTTPException(409, "旁观会话不能入局发言")
    if s.status != "awaiting_player" or not s.seat.awaiting:
        raise HTTPException(409, "现在不是你的发言回合")
    text = (body.text or "").strip()
    if body.delegate == bool(text):
        raise HTTPException(400, "delegate 与 text 二选一")
    turn_key = s.seat.awaiting["turn_key"]
    if body.delegate:
        return {"turn_key": turn_key, "delegate": True}
    admissions = list(body.meta.admissions) if body.meta else []
    meta: dict = {"admissions": admissions}
    if _meta_needs_extract(body.meta):
        from .seat.advisor import extract_meta, resolve_advisor

        resolved = resolve_advisor(s.case, get_settings(), PROVIDERS)
        if resolved is not None:
            try:
                extracted = await extract_meta(
                    resolved[0],
                    text,
                    [a.id for a in s.specs],
                    [asset.id for asset in s.case.assets],
                )
                supplied = body.meta.model_fields_set if body.meta else set()
                for key in ("action", "target", "claims"):
                    if key not in supplied:
                        meta[key] = extracted[key]
            except Exception:
                meta.update({"action": "propose", "target": None, "claims": {}})
        else:
            meta.update({"action": "propose", "target": None, "claims": {}})
        if body.meta is not None:
            if "action" in body.meta.model_fields_set:
                meta["action"] = body.meta.action
            if "target" in body.meta.model_fields_set:
                meta["target"] = body.meta.target
            if "claims" in body.meta.model_fields_set:
                meta["claims"] = body.meta.claims
    else:
        assert body.meta is not None
        if body.meta.action:
            meta["action"] = body.meta.action
        if body.meta.target is not None:
            meta["target"] = body.meta.target
        if body.meta.claims is not None:
            meta["claims"] = body.meta.claims
        meta.setdefault("action", "propose")
    meta["admissions"] = admissions
    return {"turn_key": turn_key, "text": text[:500], "meta": meta, "delegate": False}


def _get(session_id: str) -> Session:
    s = SESSIONS.get(session_id)
    if s:
        return s
    if persist_enabled():
        try:
            session, extras = rebuild_session(session_id, get_settings(), PROVIDERS)
        except KeyError:
            raise HTTPException(404, "会话不存在") from None
        orch = rebuild_orchestrator(session, extras)
        SESSIONS[session.id] = session
        ORCHESTRATORS[session.id] = orch
        register_orchestrator(orch)
        return session
    raise HTTPException(404, "会话不存在")


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


@app.put("/api/sessions/{session_id}/seat")
async def set_seat(session_id: str, body: SeatBody) -> dict:
    s = _get(session_id)
    if s.seat is None:
        raise HTTPException(404, "旁观会话没有席位")
    if s.status in {"done", "cancelled", "error"}:
        raise HTTPException(409, "听证会已经结束")
    async with s.speak_lock:
        if s.status == "awaiting_player" and not body.human:
            pending = await _prepare_pending(s, SpeakBody(delegate=True))
            _commit_speak_claim(s, pending, human=False)
            s.emit("seat", {"human": False})
            return {"ok": True, "human": False}
        s.seat.human = body.human
        s.emit("seat", {"human": body.human})
        orch = _ensure_orch(s)
        s.persist_snapshot(orch._extras())
    return {"ok": True, "human": body.human}


@app.post("/api/sessions/{session_id}/speak")
async def speak(session_id: str, body: SpeakBody) -> dict:
    s = _get(session_id)
    async with s.speak_lock:
        pending = await _prepare_pending(s, body)
        _commit_speak_claim(s, pending)
    return {"ok": True}


@app.post("/api/sessions/{session_id}/cards")
async def regenerate_cards(session_id: str) -> dict:
    s = _get(session_id)
    if s.seat is None or s.status != "awaiting_player" or not s.seat.awaiting:
        raise HTTPException(409, "现在不是你的发言回合")
    key = s.seat.awaiting["turn_key"]
    s.seat.cards.pop(key, None)
    orch = _ensure_orch(s)
    phase = str(s.seat.awaiting.get("phase") or "statements")
    round_no = int(s.seat.awaiting.get("round") or 0)
    focus = s.seat.awaiting.get("focus") or ""
    member = next(m for m in s.case.members if m.id == orch.player_id)
    cards = await orch._cards_for(key, member, phase, round_no, focus)
    s.persist_snapshot(orch._extras())
    return {"ok": True, "cards": cards}


@app.post("/api/sessions/{session_id}/evidence")
async def submit_evidence(session_id: str, body: EvidenceBody) -> dict:
    s = _get(session_id)
    if s.seat is None or s.case.seat is None:
        raise HTTPException(404, "旁观会话没有当事人举证席位")
    async with s.speak_lock:
        if s.status != "awaiting_player" or not s.seat.awaiting:
            raise HTTPException(409, "只能在轮到你发言时提交庭上证据")
        turn_key = str(s.seat.awaiting.get("turn_key") or "")
        if any(item.get("turn_key") == turn_key for item in s.seat.evidence):
            raise HTTPException(409, "本回合已经提交过一项证据")
        if any(item.get("fact_key") == body.fact_key for item in s.seat.evidence):
            raise HTTPException(409, "这项待证事实已经举证")

        option = option_for(s.case, s.case.seat.player_id, body.fact_key)
        if option is None:
            raise HTTPException(422, "该事实不在本案可举证的 what-if 清单中")
        evidence_type = body.evidence_type.strip()
        if evidence_type not in option.evidence_types:
            raise HTTPException(422, "材料类型不在该事实的举证清单中")
        note = " ".join(body.note.split())
        if len(note) < 2:
            raise HTTPException(422, "请填写至少 2 个字的材料摘要")

        record = CourtEvidence(
            id=f"ev-{uuid.uuid4().hex[:10]}",
            turn_key=turn_key,
            submitted_by=s.case.seat.player_id,
            fact_key=option.fact_key,
            subject_id=option.subject_id,
            subject_name=option.subject_name,
            subject_kind=option.subject_kind,
            lever=option.lever,
            label=option.label,
            article=option.article,
            delta_pct=option.delta_pct,
            direction=option.direction,
            evidence_type=evidence_type,
            note=note,
            submitted_at=round(time.time(), 3),
        )
        dumped = record.model_dump()
        s.seat.evidence.append(dumped)
        orch = _ensure_orch(s)
        try:
            s.persist_snapshot(orch._extras())
        except Exception:
            s.seat.evidence.pop()
            try:
                s.persist_snapshot(orch._extras())
            except Exception:
                pass
            raise

        _effective_case, effective_legal, _records = adjudicated_case(
            s.case,
            s.case.seat.player_id,
            s.seat.evidence,
        )
        payload = {"evidence": dumped, "legal": effective_legal.model_dump()}
        s.emit("evidence", payload)
        return {"ok": True, **payload}


@app.post("/api/sessions/{session_id}/interject")
async def interject(session_id: str, body: InterjectBody) -> dict:
    s = _get(session_id)
    if s.seat is not None:
        raise HTTPException(409, "入局推演模式下逝者不能显灵——这是当事人视角的沙盘")
    if s.status != "running":
        raise HTTPException(409, "听证会已经结束，幽灵也该安息了")
    s.interjections.append(body.text.strip())
    s.emit("ghost", {"text": body.text.strip()})
    orch = ORCHESTRATORS.get(session_id)
    if orch:
        s.persist_snapshot(orch._extras())
    return {"ok": True, "queued": len(s.interjections)}


@app.post("/api/sessions/{session_id}/pause")
async def pause_session(session_id: str) -> dict:
    s = _get(session_id)
    if s.status == "awaiting_player":
        raise HTTPException(409, "正在等你发言，无需休庭")
    if s.status not in {"running", "paused"}:
        raise HTTPException(409, "听证会已经结束")
    s.paused = True
    s.status = "paused"
    orch = ORCHESTRATORS.get(session_id)
    extras = orch._extras() if orch else {"paused": True, "interjections": s.interjections}
    if persist_enabled():
        update_status(s.id, "paused", extras)
    return {"ok": True, "status": "paused"}


@app.post("/api/sessions/{session_id}/resume")
async def resume_session(session_id: str) -> dict:
    s = _get(session_id)
    if s.status not in {"running", "paused"}:
        raise HTTPException(409, "听证会已经结束")
    s.paused = False
    s.status = "running"
    orch = ORCHESTRATORS.get(session_id)
    if orch is None:
        orch = rebuild_orchestrator(s, {"paused": False})
        ORCHESTRATORS[s.id] = orch
        register_orchestrator(orch)
    s.persist_snapshot(orch._extras())
    if s.task is None or s.task.done():
        s.task = _spawn(orch, resume=True)
    return {"ok": True, "status": "running"}


@app.get("/api/sessions/{session_id}/export", response_class=PlainTextResponse)
async def export(session_id: str) -> str:
    return export_markdown(_get(session_id))
