import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.court_graph import register_orchestrator, set_checkpointer  # noqa: E402
from app.agents.restore import rebuild_orchestrator, rebuild_session  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.main import ORCHESTRATORS, SESSIONS, SeatBody, SpeakBody, SpeakMeta, set_seat, speak  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Member, ModelRef  # noqa: E402
from app.persist import init_engine, reset_engine  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402


def _client() -> TestClient:
    try:
        return TestClient(app, lifespan="off")
    except TypeError:
        return TestClient(app)


def _human_case(player_id: str = "wife", **kw):
    case = seated(player_id, **kw)
    case.seat.seat_human = True
    case.speed = 4.0
    case.rounds = kw.get("rounds", 1)
    return case


async def _no_sleep(self, seconds):  # noqa: ARG001
    await asyncio.sleep(0)


def _bind(session, orch):
    SESSIONS[session.id] = session
    ORCHESTRATORS[session.id] = orch
    register_orchestrator(orch)


async def _until_awaiting(orch):
    await orch.run()
    assert orch.s.status == "awaiting_player", (
        orch.s.status,
        [e["type"] for e in orch.s.events],
    )


async def _speak_and_resume(session, orch, body: SpeakBody):
    await speak(session.id, body)
    task = session.task
    if task is not None and not task.done():
        await task
    elif session.status == "running":
        await orch.run(resume=True)


async def _drive_to_done(session, orch, text: str = "我主张按法定份额处理。"):
    if session.status != "awaiting_player":
        await orch.run()
    while session.status == "awaiting_player":
        await _speak_and_resume(session, orch, SpeakBody(text=text))
    if session.status == "running":
        await orch.run(resume=True)


def test_awaiting_player_pauses_before_human_speech(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_until_awaiting(orch))
    types = [e["type"] for e in session.events]
    assert types.count("awaiting_player") == 1
    assert session.status == "awaiting_player"
    after = types.index("awaiting_player")
    assert "speech_start" not in types[after:]
    await_evt = next(e for e in session.events if e["type"] == "awaiting_player")
    assert await_evt["turn_key"].startswith("statements:0:wife")


def test_speak_replays_player_turn_and_records_admission(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def scenario():
        await _until_awaiting(orch)
        await _speak_and_resume(session, orch, SpeakBody(
            text="王大宝你八年没回家，我放弃一部分份额也认了。",
            meta={"action": "attack", "target": "son", "admissions": ["waive_share"]},
        ))
        await _drive_to_done(session, orch)
        assert session.status == "done"

    asyncio.run(scenario())
    player = [t for t in session.transcript if t.agent_id == "wife" and t.phase == "statements"]
    assert player and player[0].meta["admissions"] == ["waive_share"]
    assert player[0].meta["action"] == "attack"
    assert player[0].meta["target"] == "son"
    assert any(e["type"] == "relation" and e.get("from") == "wife" and e.get("to") == "son" for e in session.events)
    facts = session.verdict["established_facts"]
    assert any(f["kind"] == "waive_share" and f["member_id"] == "wife" for f in facts)


def test_delegate_uses_mock_speech(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def scenario():
        await _until_awaiting(orch)
        await _speak_and_resume(session, orch, SpeakBody(delegate=True))
        while session.status == "awaiting_player":
            await _speak_and_resume(session, orch, SpeakBody(delegate=True))

    asyncio.run(scenario())
    first = next(t for t in session.transcript if t.agent_id == "wife" and t.phase == "statements")
    assert first.text
    assert first.meta.get("action") in {"attack", "ally", "propose", "concede", "plead"}


def test_ai_player_meta_cannot_create_admissions():
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)

    delegated = orch._normalize_meta(
        "wife",
        {"action": "propose", "admissions": ["admit_neglect", "waive_share", "acknowledge_support:son"]},
    )
    explicit = orch._normalize_meta(
        "wife",
        {"action": "propose", "admissions": ["waive_share"], "by": "human"},
        allow_player_admissions=True,
    )

    assert delegated["admissions"] == []
    assert explicit["admissions"] == ["waive_share"]


def test_waiting_409_and_speak_once(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_until_awaiting(orch))
    client = _client()
    assert client.post(f"/api/sessions/{session.id}/pause").status_code == 409
    assert client.post(f"/api/sessions/{session.id}/interject", json={"text": "嘿"}).status_code == 409
    first = client.post(f"/api/sessions/{session.id}/speak", json={"text": "我要求法定份额。"})
    assert first.status_code == 200, first.text
    third = client.post(f"/api/sessions/{session.id}/speak", json={"text": "再说一句"})
    assert third.status_code == 409


def test_restart_stays_awaiting_then_speak_resumes(tmp_path, monkeypatch):
    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")
    try:
        saver = InMemorySaver()
        set_checkpointer(saver)
        monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
        case = _human_case()
        session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
        orch = Orchestrator(session)
        register_orchestrator(orch)
        asyncio.run(_until_awaiting(orch))
        session.persist_snapshot(orch._extras())
        speeches_before = len(session.transcript)
        events_before = len(session.events)

        rebuilt, extras = rebuild_session(session.id, MOCK_SETTINGS, None)
        orch2 = rebuild_orchestrator(rebuilt, extras)
        register_orchestrator(orch2)
        asyncio.run(orch2.run(resume=True))
        assert rebuilt.status == "awaiting_player"
        assert len(rebuilt.transcript) == speeches_before
        assert not any(e["type"] == "speech_start" for e in rebuilt.events[events_before:])

        _bind(rebuilt, orch2)

        async def finish():
            await _drive_to_done(rebuilt, orch2)

        asyncio.run(finish())
        assert any(t.agent_id == "wife" for t in rebuilt.transcript)
    finally:
        reset_engine()


def test_awaiting_and_cards_emitted_once(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def scenario():
        await _until_awaiting(orch)
        key = session.seat.awaiting["turn_key"]
        await _speak_and_resume(session, orch, SpeakBody(text="先说这一轮。"))
        awaiting = [e for e in session.events if e["type"] == "awaiting_player" and e.get("turn_key") == key]
        cards = [e for e in session.events if e["type"] == "cards" and e.get("turn_key") == key]
        assert len(awaiting) == 1
        assert len(cards) == 1

    asyncio.run(scenario())


def test_spectator_and_ai_seat_have_no_awaiting(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    spec = sample_case()
    spec.speed = 4.0
    spec.rounds = 1
    session = build_session(spec, compute_legal_shares(spec), MOCK_SETTINGS)
    asyncio.run(Orchestrator(session).run())
    assert session.status == "done"
    assert not any(e["type"] == "awaiting_player" for e in session.events)

    ai = seated("wife")
    ai.seat.seat_human = False
    ai.speed = 4.0
    ai.rounds = 1
    seated_ai = build_session(ai, compute_legal_shares(ai), MOCK_SETTINGS)
    asyncio.run(Orchestrator(seated_ai).run())
    assert seated_ai.status == "done"
    assert not any(e["type"] == "awaiting_player" for e in seated_ai.events)


def test_four_round_twelve_roles_with_player_reaches_done(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case(rounds=4)
    case.members.extend(Member(id=f"friend_{i}", name=f"朋友{i}", relation="friend") for i in range(6))
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def drive():
        await _drive_to_done(session, orch, "我坚持法定份额。")

    asyncio.run(drive())
    assert session.status == "done"
    assert session.verdict


def test_no_advisor_emits_empty_cards(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    asyncio.run(_until_awaiting(orch))
    cards = [e for e in session.events if e["type"] == "cards"]
    assert cards and cards[0]["cards"] == []


def test_fake_advisor_cards_and_regenerate(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def fake_cards(*_a, **_k):
        return [
            {"title": "开场", "text": "我先报法定份额，房子按第1156条折价。", "responds_to": None,
             "action": "propose", "claims": {"house": 40}, "suggests_admission": None,
             "serves": ["baseline-0"], "risk_note": ""},
            {"title": "防守", "text": "王大宝的指控没有证据。", "responds_to": "son",
             "action": "attack", "claims": {}, "suggests_admission": None,
             "serves": ["risks-0"], "risk_note": "勿自认"},
            {"title": "确认", "text": "女儿尽了主要扶养，我可以确认。", "responds_to": "daughter",
             "action": "ally", "claims": {}, "suggests_admission": "acknowledge_support:daughter",
             "serves": ["playbook-0"], "risk_note": "需你手动勾选"},
        ]

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.generate_cards", fake_cards)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    asyncio.run(_until_awaiting(orch))
    key = session.seat.awaiting["turn_key"]
    assert len(session.seat.cards[key]) == 3
    assert all(
        c["suggests_admission"] in {None, "acknowledge_support:daughter"}
        for c in session.seat.cards[key]
    )

    async def bad_card(*_a, **_k):
        return [
            {"title": "坏卡", "text": "我承认没尽义务。", "responds_to": None,
             "action": "propose", "claims": {}, "suggests_admission": "admit_neglect",
             "serves": [], "risk_note": ""},
            {"title": "好卡", "text": "按法定份额。", "responds_to": None,
             "action": "propose", "claims": {}, "suggests_admission": None,
             "serves": [], "risk_note": ""},
        ]

    monkeypatch.setattr("app.seat.advisor.generate_cards", bad_card)
    from app.main import regenerate_cards

    async def regen():
        session.seat.cards.pop(key, None)
        body = await regenerate_cards(session.id)
        return body

    out = asyncio.run(regen())
    cards = out.get("cards") or session.seat.cards.get(key) or []
    assert all(c.get("suggests_admission") != "admit_neglect" for c in cards)
    assert any(e["type"] == "cards" for e in session.events)


def test_speak_meta_extract_ignores_model_admissions(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def fake_meta(*_a, **_k):
        return {"action": "attack", "target": "son", "claims": {}, "admissions": ["admit_neglect"]}

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.extract_meta", fake_meta)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def scenario():
        await _until_awaiting(orch)
        await _speak_and_resume(session, orch, SpeakBody(text="周明你八年没回家。"))

    asyncio.run(scenario())
    turn = next(t for t in session.transcript if t.agent_id == "wife" and t.phase == "statements")
    assert turn.meta["action"] == "attack"
    assert turn.meta["target"] == "son"
    assert turn.meta["admissions"] == []
    assert turn.meta["by"] == "human"


def test_speak_partial_meta_extracts_only_missing_fields(monkeypatch):
    set_checkpointer(InMemorySaver())
    monkeypatch.setattr(Orchestrator, "_sleep", _no_sleep)

    async def fake_meta(*_a, **_k):
        return {"action": "attack", "target": "son", "claims": {"house": 60}}

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.extract_meta", fake_meta)
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)

    async def scenario():
        await _until_awaiting(orch)
        await _speak_and_resume(
            session,
            orch,
            SpeakBody(text="我愿意结盟，但房产应由我取得。", meta=SpeakMeta(action="ally")),
        )

    asyncio.run(scenario())
    turn = next(t for t in session.transcript if t.agent_id == "wife" and t.phase == "statements")
    assert turn.meta["action"] == "ally"
    assert turn.meta["target"] == "son"
    assert turn.meta["claims"] == {"house": 60}
    assert turn.meta["admissions"] == []


def test_concurrent_speak_claims_waiting_turn_once(monkeypatch):
    case = _human_case()
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    session.status = "awaiting_player"
    session.seat.awaiting = {"turn_key": "statements:0:wife", "phase": "statements", "round": 0}

    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_meta(*_args, **_kwargs):
        entered.set()
        await release.wait()
        return {"action": "propose", "target": None, "claims": {}}

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *a, **k: (object(), "fake"))
    monkeypatch.setattr("app.seat.advisor.extract_meta", slow_meta)
    monkeypatch.setattr("app.main._spawn", lambda *_a, **_k: asyncio.get_running_loop().create_future())

    async def scenario():
        first = asyncio.create_task(speak(session.id, SpeakBody(text="第一份发言")))
        await entered.wait()
        second = asyncio.create_task(speak(session.id, SpeakBody(text="第二份发言")))
        await asyncio.sleep(0)
        release.set()
        return await asyncio.gather(first, second, return_exceptions=True)

    results = asyncio.run(scenario())
    assert sum(isinstance(item, dict) and item.get("ok") is True for item in results) == 1
    conflicts = [item for item in results if isinstance(item, HTTPException)]
    assert len(conflicts) == 1
    assert conflicts[0].status_code == 409


@pytest.mark.parametrize("failure_point", ["persist", "spawn"])
def test_speak_commit_failure_rolls_back_and_allows_one_retry(monkeypatch, failure_point):
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    awaiting = {"turn_key": "statements:0:wife", "phase": "statements", "round": 0}
    session.status = "awaiting_player"
    session.seat.awaiting = dict(awaiting)
    persisted_statuses = []
    persist_attempts = 0
    spawn_attempts = 0

    def persist_snapshot(_extras):
        nonlocal persist_attempts
        persist_attempts += 1
        if failure_point == "persist" and persist_attempts == 1:
            raise RuntimeError("disk unavailable")
        persisted_statuses.append(session.status)

    def spawn(*_args, **_kwargs):
        nonlocal spawn_attempts
        spawn_attempts += 1
        if failure_point == "spawn" and spawn_attempts == 1:
            raise RuntimeError("task startup failed")
        return asyncio.get_running_loop().create_future()

    monkeypatch.setattr(session, "persist_snapshot", persist_snapshot)
    monkeypatch.setattr("app.main._spawn", spawn)
    body = SpeakBody(
        text="可重试的发言",
        meta=SpeakMeta(action="propose", target=None, claims={}, admissions=[]),
    )

    async def scenario():
        with pytest.raises(RuntimeError):
            await speak(session.id, body)
        assert session.status == "awaiting_player"
        assert session.seat.pending is None
        assert session.seat.awaiting == awaiting
        assert persisted_statuses[-1] == "awaiting_player"
        if failure_point == "persist":
            assert persisted_statuses == ["awaiting_player"]
        else:
            assert persisted_statuses == ["running", "awaiting_player"]

        assert await speak(session.id, body) == {"ok": True}
        with pytest.raises(HTTPException) as duplicate:
            await speak(session.id, body)
        assert duplicate.value.status_code == 409

    asyncio.run(scenario())


@pytest.mark.parametrize("failure_point", ["persist", "spawn"])
def test_delegate_seat_failure_is_atomic_and_retryable(monkeypatch, failure_point):
    case = _human_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    _bind(session, orch)
    awaiting = {"turn_key": "statements:0:wife", "phase": "statements", "round": 0}
    session.status = "awaiting_player"
    session.seat.human = True
    session.seat.awaiting = dict(awaiting)
    persisted = []
    persist_attempts = 0
    spawn_attempts = 0

    def persist_snapshot(_extras):
        nonlocal persist_attempts
        persist_attempts += 1
        if failure_point == "persist" and persist_attempts == 1:
            raise RuntimeError("disk unavailable")
        persisted.append((session.status, session.seat.human, session.seat.pending))

    def spawn(*_args, **_kwargs):
        nonlocal spawn_attempts
        spawn_attempts += 1
        if failure_point == "spawn" and spawn_attempts == 1:
            raise RuntimeError("task startup failed")
        return asyncio.get_running_loop().create_future()

    monkeypatch.setattr(session, "persist_snapshot", persist_snapshot)
    monkeypatch.setattr("app.main._spawn", spawn)

    async def scenario():
        with pytest.raises(RuntimeError):
            await set_seat(session.id, SeatBody(human=False))
        assert session.status == "awaiting_player"
        assert session.seat.human is True
        assert session.seat.pending is None
        assert session.seat.awaiting == awaiting
        assert [event for event in session.events if event["type"] == "seat"] == []
        assert persisted[-1] == ("awaiting_player", True, None)

        assert await set_seat(session.id, SeatBody(human=False)) == {"ok": True, "human": False}
        seat_events = [event for event in session.events if event["type"] == "seat"]
        assert len(seat_events) == 1
        assert seat_events[0]["human"] is False
        assert session.status == "running"
        assert session.seat.human is False
        assert session.seat.pending == {"turn_key": awaiting["turn_key"], "delegate": True}

    asyncio.run(scenario())
