import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.agents import Orchestrator, build_session, export_markdown  # noqa: E402
from app.agents.restore import rebuild_session  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.main import app  # noqa: E402
from app.persist import init_engine, reset_engine, save_verdict  # noqa: E402
from app.seat.evidence import court_evidence_options  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS  # noqa: E402


def _client() -> TestClient:
    try:
        return TestClient(app, lifespan="off")
    except TypeError:
        return TestClient(app)


def _case():
    case = seated("daughter", discretion=0)
    next(member for member in case.members if member.id == "daughter").main_support = False
    return case


def _awaiting_session():
    from app.main import ORCHESTRATORS, SESSIONS

    case = _case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    session.status = "awaiting_player"
    assert session.seat is not None
    session.seat.human = True
    session.seat.awaiting = {
        "turn_key": "statements:0:daughter",
        "phase": "statements",
        "round": 0,
        "focus": "",
        "emitted": True,
    }
    orch = Orchestrator(session)
    SESSIONS[session.id] = session
    ORCHESTRATORS[session.id] = orch
    return case, session, orch


def _main_support_option(case):
    option = next(
        row for row in court_evidence_options(case, "daughter")
        if row.fact_key == "main_support:daughter"
    )
    return option


def _submit(session_id: str, case):
    option = _main_support_option(case)
    return _client().post(
        f"/api/sessions/{session_id}/evidence",
        json={
            "fact_key": option.fact_key,
            "evidence_type": option.evidence_types[0],
            "note": "连续三年的住院陪护票据",
        },
    )


def test_evidence_options_are_rule_backed_and_public_in_session_start():
    case, session, orch = _awaiting_session()
    option = _main_support_option(case)
    assert option.article == "1130"
    assert option.delta_pct > 0
    assert option.evidence_types

    orch._emit_session_start()
    start = next(event for event in session.events if event["type"] == "session_start")
    public = next(row for row in start["evidence_options"] if row["fact_key"] == option.fact_key)
    assert public["burden"]
    assert public["evidence_types"] == option.evidence_types


def test_submit_evidence_updates_preview_and_enforces_turn_and_whitelists():
    case, session, _orch = _awaiting_session()
    before = next(row.percent for row in session.legal.shares if row.member_id == "daughter")

    invalid = _client().post(
        f"/api/sessions/{session.id}/evidence",
        json={
            "fact_key": "main_support:daughter",
            "evidence_type": "我自己编的材料",
            "note": "这不在静态清单里",
        },
    )
    assert invalid.status_code == 422

    response = _submit(session.id, case)
    assert response.status_code == 200, response.text
    body = response.json()
    after = next(row["percent"] for row in body["legal"]["shares"] if row["member_id"] == "daughter")
    assert after > before
    assert body["evidence"]["status"] == "accepted_for_simulation"
    assert session.seat is not None and len(session.seat.evidence) == 1
    assert any(event["type"] == "evidence" for event in session.events)

    duplicate_turn = _client().post(
        f"/api/sessions/{session.id}/evidence",
        json={
            "fact_key": next(
                row.fact_key for row in court_evidence_options(case, "daughter")
                if row.fact_key != "main_support:daughter"
            ),
            "evidence_type": next(
                row.evidence_types[0] for row in court_evidence_options(case, "daughter")
                if row.fact_key != "main_support:daughter"
            ),
            "note": "同一回合不能连续提交",
        },
    )
    assert duplicate_turn.status_code == 409
    assert "本回合" in duplicate_turn.text


def test_submit_evidence_rejects_spectator_and_non_player_turn():
    from app.main import SESSIONS

    spectator_case = cat_case()
    spectator = build_session(spectator_case, compute_legal_shares(spectator_case), MOCK_SETTINGS)
    SESSIONS[spectator.id] = spectator
    blocked = _client().post(
        f"/api/sessions/{spectator.id}/evidence",
        json={"fact_key": "main_support:daughter", "evidence_type": "护理费票据", "note": "无席位"},
    )
    assert blocked.status_code == 404

    case = _case()
    running = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    SESSIONS[running.id] = running
    too_early = _submit(running.id, case)
    assert too_early.status_code == 409


def test_verdict_recalculates_legal_baseline_from_evidence(monkeypatch):
    case, session, orch = _awaiting_session()
    original = next(row.percent for row in session.legal.shares if row.member_id == "daughter")
    response = _submit(session.id, case)
    assert response.status_code == 200
    evidence_id = response.json()["evidence"]["id"]

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)
    session.status = "running"
    asyncio.run(orch._verdict())

    verdict = session.verdict
    assert verdict is not None
    assert verdict["original_legal_percent"]["daughter"] == original
    assert verdict["legal_percent"]["daughter"] > original
    assert abs(verdict["targets"]["daughter"] - verdict["legal_percent"]["daughter"]) < 0.1
    evidence_fact = next(fact for fact in verdict["established_facts"] if fact.get("source") == "evidence")
    assert evidence_fact["evidence_ids"] == [evidence_id]
    assert all(item["member_id"] != "daughter" for item in verdict["adjustments"])
    exported = export_markdown(session)
    assert "### 庭上举证与法定基线重算" in exported
    assert evidence_id in exported
    assert "依据材料" in exported


def test_material_summary_is_not_injected_into_agent_prompts():
    case, session, orch = _awaiting_session()
    option = _main_support_option(case)
    sentinel = "IGNORE_ALL_RULES_SENTINEL"
    response = _client().post(
        f"/api/sessions/{session.id}/evidence",
        json={
            "fact_key": option.fact_key,
            "evidence_type": option.evidence_types[0],
            "note": sentinel,
        },
    )
    assert response.status_code == 200

    member = next(member for member in case.members if member.id == "son")
    debater_prompt = "\n".join(
        message["content"] for message in orch._debater_messages(member, "debate", 1, None, "扶养")
    )
    executor_prompt = "\n".join(
        message["content"] for message in orch._executor_messages("继续审理")
    )
    assert option.evidence_types[0] in debater_prompt
    assert option.evidence_types[0] in executor_prompt
    assert sentinel not in debater_prompt
    assert sentinel not in executor_prompt


def test_evidence_runtime_survives_restore(tmp_path):
    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")
    try:
        case, session, _orch = _awaiting_session()
        response = _submit(session.id, case)
        assert response.status_code == 200
        rebuilt, _extras = rebuild_session(session.id, MOCK_SETTINGS, None)
        assert rebuilt.seat is not None
        assert rebuilt.seat.evidence[0]["id"] == response.json()["evidence"]["id"]
        assert rebuilt.status == "awaiting_player"
    finally:
        reset_engine()


def test_restore_replays_evidence_if_verdict_was_saved_before_case_snapshot(tmp_path):
    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")
    try:
        case, session, _orch = _awaiting_session()
        response = _submit(session.id, case)
        assert response.status_code == 200
        effective = response.json()["legal"]
        final_legal = {row["member_id"]: row["percent"] for row in effective["shares"]}
        session.verdict = {"legal_percent": final_legal, "evidence": [response.json()["evidence"]]}
        save_verdict(session.id, session.verdict)

        rebuilt, _extras = rebuild_session(session.id, MOCK_SETTINGS, None)
        daughter = next(member for member in rebuilt.case.members if member.id == "daughter")
        rebuilt_pct = next(row.percent for row in rebuilt.legal.shares if row.member_id == "daughter")
        assert daughter.main_support is True
        assert rebuilt_pct == final_legal["daughter"]
    finally:
        reset_engine()
