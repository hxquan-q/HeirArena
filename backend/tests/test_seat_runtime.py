import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.orchestrator import SeatRuntime  # noqa: E402
from app.agents.restore import rebuild_orchestrator, rebuild_session  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.main import app  # noqa: E402
from app.persist import init_engine, list_resumable_case_ids, reset_engine  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS  # noqa: E402


def _client() -> TestClient:
    try:
        return TestClient(app, lifespan="off")
    except TypeError:
        return TestClient(app)


def _init_tmp_db(tmp_path) -> None:
    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")


def _close_tmp_db() -> None:
    reset_engine()


def test_seat_runtime_initialized_from_case():
    case = seated("daughter")
    case.seat.seat_human = True
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    assert session.seat is not None
    assert session.seat.human is True
    extras = Orchestrator(session)._extras()
    assert extras["seat"]["human"] is True


def test_spectator_session_has_null_seat():
    session = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK_SETTINGS)
    assert session.seat is None
    assert Orchestrator(session)._extras()["seat"] is None


def test_rebuild_restores_seat_runtime(tmp_path):
    _init_tmp_db(tmp_path)
    try:
        case = seated("wife")
        case.seat.seat_human = True
        session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
        session.seat.awaiting = {"turn_key": "statements:0:wife", "emitted": True}
        session.seat.cards = {"statements:0:wife": []}
        orch = Orchestrator(session)
        session.persist_snapshot(orch._extras())
        rebuilt, extras = rebuild_session(session.id, MOCK_SETTINGS, None)
        assert rebuilt.seat is not None
        assert rebuilt.seat.human is True
        assert rebuilt.seat.awaiting["turn_key"] == "statements:0:wife"
        assert extras["seat"]["human"] is True
        orch2 = rebuild_orchestrator(rebuilt, extras)
        assert orch2.s.seat.cards["statements:0:wife"] == []
    finally:
        _close_tmp_db()


def test_put_seat_emits_and_rejects_spectator():
    from app.main import ORCHESTRATORS, SESSIONS

    case = seated("daughter")
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)
    SESSIONS[session.id] = session
    ORCHESTRATORS[session.id] = orch
    client = _client()
    res = client.put(f"/api/sessions/{session.id}/seat", json={"human": True})
    assert res.status_code == 200, res.text
    assert any(e["type"] == "seat" and e.get("human") is True for e in session.events)
    assert session.seat.human is True

    spec = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK_SETTINGS)
    SESSIONS[spec.id] = spec
    missing = client.put(f"/api/sessions/{spec.id}/seat", json={"human": True})
    assert missing.status_code == 404


def test_seat_session_interject_409_spectator_ok():
    from app.main import ORCHESTRATORS, SESSIONS

    seated_s = build_session(seated("daughter"), compute_legal_shares(seated("daughter")), MOCK_SETTINGS)
    SESSIONS[seated_s.id] = seated_s
    spec = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK_SETTINGS)
    SESSIONS[spec.id] = spec
    ORCHESTRATORS[spec.id] = Orchestrator(spec)
    client = _client()
    blocked = client.post(f"/api/sessions/{seated_s.id}/interject", json={"text": "别吵了"})
    assert blocked.status_code == 409
    assert "显灵" in blocked.text
    ok = client.post(f"/api/sessions/{spec.id}/interject", json={"text": "别吵了"})
    assert ok.status_code == 200, ok.text


def test_pause_409_while_awaiting_player():
    from app.main import SESSIONS

    session = build_session(seated("wife"), compute_legal_shares(seated("wife")), MOCK_SETTINGS)
    session.status = "awaiting_player"
    SESSIONS[session.id] = session
    res = _client().post(f"/api/sessions/{session.id}/pause")
    assert res.status_code == 409
    assert "等你发言" in res.text


def test_awaiting_player_is_resumable_but_not_autospawned(tmp_path):
    _init_tmp_db(tmp_path)
    try:
        case = seated("wife")
        session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
        session.status = "awaiting_player"
        session.persist_snapshot({"seat": {"human": True, "awaiting": {"turn_key": "x"}, "cards": {}, "pending": None, "debrief": None}})
        assert session.id in list_resumable_case_ids()
        rebuilt, extras = rebuild_session(session.id, MOCK_SETTINGS, None)
        assert rebuilt.status == "awaiting_player"
        from app.main import _should_autoresume

        assert _should_autoresume(rebuilt) is False
        assert extras["seat"]["human"] is True
    finally:
        _close_tmp_db()
