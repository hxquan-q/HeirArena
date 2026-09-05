import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.court_graph import register_orchestrator, set_checkpointer  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.main import ORCHESTRATORS, SESSIONS, SpeakBody, speak  # noqa: E402
from app.models import Goals, ModelRef  # noqa: E402
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
            rationales={"wife": ["陈述让步"]},
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
