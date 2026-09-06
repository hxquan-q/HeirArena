import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.court_graph import register_orchestrator, set_checkpointer  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.main import ORCHESTRATORS, SESSIONS, SpeakBody, speak  # noqa: E402
from app.models import Goals, ModelRef, RedLine, SoftGoal  # noqa: E402
from app.seat.advisor import AdvisorUnavailable, DebriefOut  # noqa: E402
from app.seat.scoring import build_scorecard  # noqa: E402
from tests.seat_fixtures import seated  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402
from tests.test_seat_turn import _drive_to_done, _human_case, _no_sleep  # noqa: E402


def _bind(session, orch):
    SESSIONS[session.id] = session
    ORCHESTRATORS[session.id] = orch
    register_orchestrator(orch)


def test_scripted_seat_session_emits_debrief_between_verdict_and_done(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    case.seat.goals["wife"] = Goals(target_assets=["house"], min_value_share=20, source="user")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))
    types = [e["type"] for e in session.events]
    assert "debrief" in types
    assert types.index("verdict") < types.index("debrief") < types.index("done")
    debrief = next(e for e in session.events if e["type"] == "debrief")
    assert set(debrief["scorecards"]) >= {"wife", "son", "daughter"}
    player = debrief["scorecards"]["wife"]
    expected = build_scorecard(case.seat.goals["wife"], session.verdict, "wife")
    assert abs(player["total"] - expected.total) < 0.11
    assert debrief["narrative"] is None


def test_fake_advisor_debrief_fills_narrative(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def fake_debrief(*_a, **_k):
        return DebriefOut(
            soft_scores={"wife": {"0": 0.8}},
            custom_red_lines={"wife": {}},
            narrative="你在陈述阶段的让步多余，turn_id 已引用。",
            next_time=["下一局把最低份额降到可达上限以内"],
            rationales={},
        )

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.generate_debrief", fake_debrief)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    case.seat.goals["wife"] = Goals(target_assets=["house"], source="user")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))
    debrief = next(e for e in session.events if e["type"] == "debrief")
    assert debrief["narrative"]
    assert len(debrief["next_time"]) <= 5


def test_debrief_saves_item_rationales_and_only_valid_turn_ids(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    session = None

    async def fake_debrief(*_args, **_kwargs):
        valid_turn = session.transcript[0].turn_id
        return DebriefOut(
            soft_scores={"wife": {"0": 0.8}},
            custom_red_lines={"wife": {"0": True}},
            narrative=f"关键发言 [t:{valid_turn}]",
            next_time=[],
            rationales={
                "wife": [
                    {"kind": "soft_goal", "index": 0, "reason": "付出得到回应", "turn_ids": [valid_turn, "bogus"]},
                    {"kind": "custom_red_line", "index": 0, "reason": "没有公开羞辱", "turn_ids": [valid_turn]},
                ]
            },
        )

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.generate_debrief", fake_debrief)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    case.seat.goals["wife"] = Goals(
        red_lines=[RedLine(kind="custom", text="不被公开羞辱")],
        soft_goals=[SoftGoal(kind="recognition")],
        source="user",
    )
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))

    debrief = next(e for e in session.events if e["type"] == "debrief")
    parts = {part["key"]: part for part in debrief["scorecards"]["wife"]["parts"]}
    valid_turn = session.transcript[0].turn_id
    assert parts["soft_goals"]["turn_ids"] == [valid_turn]
    assert "付出得到回应" in parts["soft_goals"]["detail"]
    assert parts["red_lines"]["turn_ids"] == [valid_turn]
    assert "没有公开羞辱" in parts["red_lines"]["detail"]


@pytest.mark.parametrize("mapping_case", ["empty", "member_missing", "category_missing"])
def test_debrief_missing_score_mappings_still_score_complete_goal_sets(monkeypatch, mapping_case):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def fake_debrief(*_args, **_kwargs):
        base = {
            "narrative": "复盘",
            "next_time": [],
            "rationales": {},
        }
        if mapping_case == "empty":
            return DebriefOut(soft_scores={}, custom_red_lines={}, **base)
        if mapping_case == "member_missing":
            return DebriefOut(
                soft_scores={"son": {"0": 1.0}},
                custom_red_lines={"son": {"0": True}},
                **base,
            )
        return DebriefOut.model_construct(custom_red_lines={}, **base)

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.generate_debrief", fake_debrief)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    case.seat.goals["wife"] = Goals(
        red_lines=[
            RedLine(kind="custom", text="不公开羞辱"),
            RedLine(kind="custom", text="不出售纪念物"),
        ],
        soft_goals=[
            SoftGoal(kind="recognition"),
            SoftGoal(kind="custom", text="保持体面"),
        ],
        source="user",
    )
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))

    event = next(e for e in session.events if e["type"] == "debrief")
    parts = {part["key"]: part for part in event["scorecards"]["wife"]["parts"]}
    assert parts["soft_goals"]["applicable"] is True
    assert parts["soft_goals"]["score"] == 0
    assert parts["red_lines"]["applicable"] is True
    assert parts["red_lines"]["score"] == 0
    assert parts["red_lines"]["detail"] == "守住 0/2"


def test_advisor_failure_still_scores_and_finishes(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def boom(*_a, **_k):
        raise AdvisorUnavailable("bad")

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.generate_debrief", boom)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))
    assert session.status == "done"
    debrief = next(e for e in session.events if e["type"] == "debrief")
    soft = next(p for p in debrief["scorecards"]["wife"]["parts"] if p["key"] == "soft_goals")
    assert soft["applicable"] is False
    assert any(e["type"] == "notice" for e in session.events)


def test_debrief_is_idempotent_on_resume(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_drive_to_done(session, orch))
    first = [e for e in session.events if e["type"] == "debrief"]
    asyncio.run(orch._debrief())
    assert [e for e in session.events if e["type"] == "debrief"] == first


def test_spectator_has_no_debrief(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = sample_case()
    case.speed = 4.0
    case.rounds = 1
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    asyncio.run(Orchestrator(session).run())
    assert not any(e["type"] == "debrief" for e in session.events)
    assert session.status == "done"
