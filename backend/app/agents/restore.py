"""从 SQLite 重建 Session / Orchestrator，供服务重启后续庭。"""
from __future__ import annotations

import json

from ..config import Settings
from ..models import CaseInput, LegalResult
from ..persist import load_case_row, load_events, load_speeches, load_verdict
from ..providers import ProviderStore
from .orchestrator import Orchestrator, SeatRuntime, Session, Turn
from .personas import AgentSpec


def rebuild_session(session_id: str, settings: Settings, providers: ProviderStore | None) -> tuple[Session, dict]:
    row = load_case_row(session_id)
    if row is None:
        raise KeyError(session_id)
    extras = json.loads(row.extras_json or "{}")
    case = CaseInput.model_validate_json(row.case_json)
    legal = LegalResult.model_validate_json(row.legal_json)
    specs = [AgentSpec.model_validate(s) for s in json.loads(row.specs_json or "[]")]
    session = Session(id=row.id, case=case, legal=legal, specs=specs, settings=settings, providers=providers)
    session.status = row.status
    session.created_at = row.created_at
    session.events = load_events(session_id)
    session.interjections = extras.get("interjections") or []
    session.claims = extras.get("claims") or {}
    session.relations = extras.get("relations") or []
    session.paused = bool(extras.get("paused"))
    session.verdict = load_verdict(session_id)
    seat_data = extras.get("seat")
    if isinstance(seat_data, dict):
        session.seat = SeatRuntime(
            human=bool(seat_data.get("human")),
            awaiting=seat_data.get("awaiting"),
            cards=seat_data.get("cards") or {},
            pending=seat_data.get("pending"),
            debrief=seat_data.get("debrief"),
            evidence=seat_data.get("evidence") or [],
        )
    elif case.seat is not None:
        session.seat = SeatRuntime(human=case.seat.seat_human)
    if session.verdict and session.seat and session.seat.evidence and case.seat:
        verdict_legal = session.verdict.get("legal_percent") or {}
        stored_legal = {share.member_id: share.percent for share in session.legal.shares}
        legal_is_current = all(
            member_id in stored_legal and abs(float(stored_legal[member_id]) - float(percent)) < 0.05
            for member_id, percent in verdict_legal.items()
        )
        if not legal_is_current:
            from ..seat.evidence import adjudicated_case

            effective_case, effective_legal, records = adjudicated_case(
                case,
                case.seat.player_id,
                session.seat.evidence,
            )
            session.case = effective_case
            session.legal = effective_legal
            session.seat.evidence = [record.model_dump() for record in records]
            percentages = {share.member_id: share.percent for share in effective_legal.shares}
            for spec in session.specs:
                spec.legal_percent = percentages.get(spec.id, 0.0)
    for sp in load_speeches(session_id):
        session.transcript.append(Turn(
            turn_id=sp["turn_id"], agent_id=sp["agent_id"], name=sp["name"],
            phase=sp["phase"], round_no=sp["round_no"], text=sp["text"], meta=sp.get("meta") or {},
        ))
    return session, extras


def rebuild_orchestrator(session: Session, extras: dict) -> Orchestrator:
    orch = Orchestrator(session)
    if extras.get("last_attacker"):
        orch.last_attacker = extras["last_attacker"]
    if extras.get("prefs"):
        orch.prefs = extras["prefs"]
    if extras.get("stats"):
        orch.stats.update(extras["stats"])
    if extras.get("focus_issues"):
        orch.focus_issues = list(extras["focus_issues"])
    return orch


def role_bindings_from_orch(orch: Orchestrator) -> list[dict[str, str]]:
    rows = []
    for spec in orch.s.specs:
        client = orch.clients.get(spec.id)
        ref = None
        if spec.id == "executor":
            ref = orch.case.executor_model or orch.case.default_model
        else:
            member = orch.members.get(spec.id)
            ref = (member.model if member else None) or orch.case.default_model
        rows.append({
            "agent_id": spec.id,
            "name": spec.name,
            "provider_id": "" if ref is None or ref.is_mock else ref.provider_id,
            "model": client.model if client else "",
            "model_label": spec.model_label,
        })
    return rows
