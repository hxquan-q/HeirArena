import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.models import CaseInput, Goals, SeatAnalysis, StrategyPack  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


@pytest.fixture
def client():
    original = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan
    with TestClient(app) as test_client:
        yield test_client
    app.router.lifespan_context = original


def test_analyze_matches_legal_preview(client: TestClient):
    case = seated("daughter")
    preview = client.post("/api/legal/preview", json=case.model_dump()).json()
    response = client.post("/api/seat/analyze", json=case.model_dump())
    assert response.status_code == 200
    parsed = SeatAnalysis.model_validate(response.json())
    daughter = next(s for s in preview["shares"] if s["member_id"] == "daughter")
    assert parsed.reachability.legal_pct == daughter["percent"]


def test_analyze_requires_seat_and_rejects_pet(client: TestClient):
    missing = client.post("/api/seat/analyze", json=cat_case().model_dump())
    assert missing.status_code == 422
    assert "席位" in str(missing.json()["detail"])
    raw = seated("daughter").model_dump()
    raw["seat"]["player_id"] = "cat_agent"
    assert client.post("/api/seat/analyze", json=raw).status_code == 422


def test_analyze_warns_when_floor_is_unrealistic(client: TestClient):
    case = seated("daughter", goals={"daughter": Goals(min_value_share=90, source="user")})
    body = client.post("/api/seat/analyze", json=case.model_dump()).json()
    assert any("不现实" in w for w in body["warnings"])


def test_strategy_degrades_without_provider(client: TestClient, monkeypatch, tmp_path):
    from app.config import Settings
    from app.providers import ProviderStore

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: Settings(api_key="", base_url="", model="", temperature=0.3, timeout=5, force_mock=True),
    )
    monkeypatch.setattr("app.main.PROVIDERS", ProviderStore(tmp_path / "empty-providers.json"))
    response = client.post("/api/seat/strategy", json=seated("daughter").model_dump())
    assert response.status_code == 200
    pack = StrategyPack.model_validate(response.json())
    assert pack.generated_by == "rules"
    assert any("未接入军师模型" in w for w in pack.warnings)
    assert pack.briefs
    assert all(brief.risks for brief in pack.briefs.values())


def test_strategy_requires_seat(client: TestClient):
    assert client.post("/api/seat/strategy", json=cat_case().model_dump()).status_code == 422


def test_strategy_with_fake_advisor(client: TestClient, monkeypatch):
    item = {"text": "守住法定基线"}
    brief = {
        "baseline": [item], "reachable": [item], "levers": [item],
        "asset_strategy": [item], "playbook": [item], "opponents": [item], "risks": [item],
    }
    matrix = {
        "rows": [
            {"member_id": "daughter", "strategy_summary": "守房争猫", "threat_level": "none", "rationale": "玩家"},
            {"member_id": "son", "strategy_summary": "高锚定争房", "threat_level": "high", "rationale": "贪婪"},
        ]
    }

    class Fake:
        label = "Qwen · qwen-plus"

        async def complete(self, messages, **_kw):
            text = messages[-1]["content"] if messages else ""
            if "strategy_summary" in text or "矩阵" in messages[0]["content"]:
                return json.dumps(matrix, ensure_ascii=False)
            return json.dumps(brief, ensure_ascii=False)

    def fake_resolve(_case, _settings, _providers):
        return Fake(), "Qwen · qwen-plus"

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", fake_resolve)
    monkeypatch.setattr("app.main.build_strategy", __import__("app.seat.advisor", fromlist=["build_strategy"]).build_strategy)
    response = client.post("/api/seat/strategy", json=seated("daughter").model_dump())
    assert response.status_code == 200
    pack = StrategyPack.model_validate(response.json())
    assert pack.generated_by == "Qwen · qwen-plus"
    assert any(row.strategy_summary for row in pack.matrix)


def test_strategy_member_failure_still_200(client: TestClient, monkeypatch):
    item = {"text": "合法条目"}
    brief = {
        "baseline": [item], "reachable": [item], "levers": [item],
        "asset_strategy": [item], "playbook": [item], "opponents": [item], "risks": [item],
    }

    class Fake:
        label = "Qwen · qwen-plus"

        async def complete(self, messages, **_kw):
            blob = "\n".join(m.get("content", "") for m in messages)
            if "请为成员 son（王大宝）" in blob:
                return "not-json"
            if "strategy_summary" in blob or (messages and "矩阵" in messages[0]["content"]):
                return json.dumps({"rows": []}, ensure_ascii=False)
            return json.dumps(brief, ensure_ascii=False)

    monkeypatch.setattr("app.seat.advisor.resolve_advisor", lambda *_a, **_k: (Fake(), "Qwen · qwen-plus"))
    response = client.post("/api/seat/strategy", json=seated("daughter").model_dump())
    assert response.status_code == 200
    pack = StrategyPack.model_validate(response.json())
    assert pack.briefs["son"].generated_by == "rules"
    assert any("son" in w for w in pack.warnings)


def test_prepare_fills_missing_player_goals():
    from fastapi import HTTPException

    from app.main import _prepare_seated_case
    from app.seat import analyze

    case = seated("daughter")
    assert case.seat and case.seat.player_id not in case.seat.goals
    filled = _prepare_seated_case(case)
    assert filled.seat is not None
    assert filled.seat.goals["daughter"].source == "inferred"

    analysis = analyze(seated("daughter", goals={"daughter": Goals(source="user")}))
    pack = StrategyPack(
        player_id="son",
        matrix=analysis.matrix,
        briefs={},
        game=analysis.game,
        reachability=analysis.reachability,
        whatif=analysis.whatif,
    )
    raw = seated("daughter").model_dump()
    raw["seat"]["strategy"] = pack.model_dump()
    mismatched = CaseInput.model_validate(raw)
    try:
        _prepare_seated_case(mismatched)
        raise AssertionError("expected 400")
    except HTTPException as error:
        assert error.status_code == 400
        assert "席位" in str(error.detail) or "玩家" in str(error.detail)


def test_create_session_rejects_unknown_advisor(client: TestClient):
    raw = seated("daughter").model_dump()
    raw["seat"]["advisor_model"] = {"provider_id": "no-such-provider", "model": "x"}
    response = client.post("/api/sessions", json=raw)
    assert response.status_code == 400
    assert "军师" in str(response.json()["detail"])


def test_session_start_compact_seat_and_observe_omits_key():
    from app.agents import Orchestrator, build_session
    from app.config import Settings
    from app.legal import compute_legal_shares

    settings = Settings(api_key="", base_url="", model="", temperature=0.3, timeout=5, force_mock=True)
    seated_case = seated("daughter", goals={"daughter": Goals(source="user")})
    orch = Orchestrator(build_session(seated_case, compute_legal_shares(seated_case), settings))
    orch._emit_session_start()
    start = next(e for e in orch.s.events if e["type"] == "session_start")
    assert start["seat"] == {"player_id": "daughter", "seat_human": False}
    assert "goals" not in start["seat"]
    assert "briefs" not in start["seat"]

    observe = Orchestrator(build_session(cat_case(), compute_legal_shares(cat_case()), settings))
    observe._emit_session_start()
    observe_start = next(e for e in observe.s.events if e["type"] == "session_start")
    assert "seat" not in observe_start


def test_rebuild_seated_case(tmp_path):
    from app.agents import build_session
    from app.agents.restore import rebuild_session
    from app.config import Settings
    from app.legal import compute_legal_shares
    from app.persist import init_engine, reset_engine

    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")
    settings = Settings(api_key="", base_url="", model="", temperature=0.3, timeout=5, force_mock=True)
    case = seated("daughter", goals={"daughter": Goals(narrative="相册", source="user")})
    session = build_session(case, compute_legal_shares(case), settings)
    rebuilt, _extras = rebuild_session(session.id, settings, None)
    assert rebuilt.case.seat is not None
    assert rebuilt.case.seat.player_id == "daughter"
    assert rebuilt.case.seat.goals["daughter"].narrative == "相册"
    reset_engine()
