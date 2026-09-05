"""SQLite + SQLModel：案件、角色模型绑定、庭审事件、发言、裁决。"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select
from sqlalchemy.engine import Engine

from .models import CaseInput, LegalResult


class CaseRecord(SQLModel, table=True):
    __tablename__ = "cases"
    id: str = Field(primary_key=True)
    decedent_name: str = ""
    story: str = ""
    case_json: str = "{}"
    legal_json: str = "{}"
    specs_json: str = "[]"
    status: str = "running"
    created_at: float = Field(default_factory=time.time)
    extras_json: str = "{}"


class RoleBinding(SQLModel, table=True):
    __tablename__ = "role_bindings"
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(index=True)
    agent_id: str
    name: str = ""
    provider_id: str = ""
    model: str = ""
    model_label: str = "剧本模式"


class CourtEvent(SQLModel, table=True):
    __tablename__ = "court_events"
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(index=True)
    seq: int
    type: str
    ts: float
    payload_json: str = "{}"


class SpeechRecord(SQLModel, table=True):
    __tablename__ = "speeches"
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: str = Field(index=True)
    turn_id: str
    agent_id: str
    name: str
    phase: str
    round_no: int = 0
    text: str = ""
    meta_json: str = "{}"


class VerdictRecord(SQLModel, table=True):
    __tablename__ = "verdicts"
    case_id: str = Field(primary_key=True)
    payload_json: str = "{}"


_ENGINE: Engine | None = None


def init_engine(database_url: str) -> Engine:
    global _ENGINE
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    _ENGINE = create_engine(database_url, connect_args=connect_args)
    SQLModel.metadata.create_all(_ENGINE)
    return _ENGINE


def get_engine() -> Engine:
    if _ENGINE is None:
        raise RuntimeError("数据库尚未初始化")
    return _ENGINE


def persist_enabled() -> bool:
    return _ENGINE is not None


def reset_engine() -> None:
    global _ENGINE
    if _ENGINE is not None:
        _ENGINE.dispose()
    _ENGINE = None


def _session() -> Session:
    return Session(get_engine())


def upsert_case(
    session_id: str,
    case: CaseInput,
    legal: LegalResult,
    specs: list[Any],
    status: str,
    extras: dict[str, Any] | None = None,
) -> None:
    row = CaseRecord(
        id=session_id,
        decedent_name=case.decedent_name,
        story=case.story,
        case_json=case.model_dump_json(),
        legal_json=legal.model_dump_json(),
        specs_json=json.dumps([s.model_dump() for s in specs], ensure_ascii=False),
        status=status,
        extras_json=json.dumps(extras or {}, ensure_ascii=False),
    )
    with _session() as db:
        existing = db.get(CaseRecord, session_id)
        if existing:
            existing.decedent_name = row.decedent_name
            existing.story = row.story
            existing.case_json = row.case_json
            existing.legal_json = row.legal_json
            existing.specs_json = row.specs_json
            existing.status = row.status
            existing.extras_json = row.extras_json
            db.add(existing)
        else:
            db.add(row)
        db.commit()


def save_role_bindings(session_id: str, bindings: list[dict[str, str]]) -> None:
    with _session() as db:
        for old in db.exec(select(RoleBinding).where(RoleBinding.case_id == session_id)).all():
            db.delete(old)
        for b in bindings:
            db.add(RoleBinding(case_id=session_id, **b))
        db.commit()


def append_event(session_id: str, evt: dict[str, Any]) -> None:
    payload = {k: v for k, v in evt.items() if k not in {"seq", "type", "ts"}}
    with _session() as db:
        exists = db.exec(
            select(CourtEvent).where(CourtEvent.case_id == session_id, CourtEvent.seq == evt["seq"])
        ).first()
        if exists:
            return
        db.add(CourtEvent(
            case_id=session_id, seq=evt["seq"], type=evt["type"], ts=evt["ts"],
            payload_json=json.dumps(payload, ensure_ascii=False),
        ))
        db.commit()


def upsert_speech(session_id: str, turn: Any) -> None:
    with _session() as db:
        existing = db.exec(
            select(SpeechRecord).where(SpeechRecord.case_id == session_id, SpeechRecord.turn_id == turn.turn_id)
        ).first()
        meta = json.dumps(getattr(turn, "meta", {}) or {}, ensure_ascii=False)
        if existing:
            existing.text = turn.text
            existing.meta_json = meta
            db.add(existing)
        else:
            db.add(SpeechRecord(
                case_id=session_id, turn_id=turn.turn_id, agent_id=turn.agent_id, name=turn.name,
                phase=turn.phase, round_no=turn.round_no, text=turn.text, meta_json=meta,
            ))
        db.commit()


def save_verdict(session_id: str, verdict: dict[str, Any]) -> None:
    with _session() as db:
        row = db.get(VerdictRecord, session_id)
        payload = json.dumps(verdict, ensure_ascii=False)
        if row:
            row.payload_json = payload
            db.add(row)
        else:
            db.add(VerdictRecord(case_id=session_id, payload_json=payload))
        db.commit()


def update_status(session_id: str, status: str, extras: dict[str, Any] | None = None) -> None:
    with _session() as db:
        row = db.get(CaseRecord, session_id)
        if not row:
            return
        row.status = status
        if extras is not None:
            row.extras_json = json.dumps(extras, ensure_ascii=False)
        db.add(row)
        db.commit()


def load_case_row(session_id: str) -> CaseRecord | None:
    with _session() as db:
        return db.get(CaseRecord, session_id)


def list_resumable_case_ids() -> list[str]:
    with _session() as db:
        rows = db.exec(select(CaseRecord).where(CaseRecord.status.in_(["running", "paused"]))).all()
        return [r.id for r in rows]


def load_events(session_id: str) -> list[dict[str, Any]]:
    with _session() as db:
        rows = db.exec(
            select(CourtEvent).where(CourtEvent.case_id == session_id).order_by(CourtEvent.seq)
        ).all()
    events = []
    for r in rows:
        payload = json.loads(r.payload_json or "{}")
        events.append({"seq": r.seq, "type": r.type, "ts": r.ts, **payload})
    return events


def load_speeches(session_id: str) -> list[dict[str, Any]]:
    with _session() as db:
        rows = db.exec(select(SpeechRecord).where(SpeechRecord.case_id == session_id)).all()
    return [
        {
            "turn_id": r.turn_id, "agent_id": r.agent_id, "name": r.name, "phase": r.phase,
            "round_no": r.round_no, "text": r.text, "meta": json.loads(r.meta_json or "{}"),
        }
        for r in rows
    ]


def load_verdict(session_id: str) -> dict[str, Any] | None:
    with _session() as db:
        row = db.get(VerdictRecord, session_id)
    if not row:
        return None
    return json.loads(row.payload_json or "{}")


def load_bindings(session_id: str) -> list[RoleBinding]:
    with _session() as db:
        return list(db.exec(select(RoleBinding).where(RoleBinding.case_id == session_id)).all())
