import asyncio
import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.llm import LLMClient  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Goals, ModelRef, RedLine, SoftGoal  # noqa: E402
from app.providers import ProviderStore, ProviderUpsert  # noqa: E402
from app.seat.advisor import (  # noqa: E402
    AdvisorUnavailable,
    BriefOut,
    CardsOut,
    DebriefOut,
    MatrixSummaryOut,
    MetaOut,
    complete_schema,
    generate_debrief,
    resolve_advisor,
)
from tests.seat_fixtures import seated  # noqa: E402

MOCK_SETTINGS = Settings(api_key="", base_url="", model="", temperature=0.3, timeout=5, force_mock=True)


def _store(tmp_path, *, ready: bool = True) -> ProviderStore:
    store = ProviderStore(tmp_path / "providers.json")
    if ready:
        store.upsert(
            "qwen",
            ProviderUpsert(
                name="Qwen",
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                api_key="sk-qwen",
                models=["qwen-plus"],
                preset="qwen",
            ),
            MOCK_SETTINGS,
        )
    return store


def test_resolve_advisor_mock_and_empty_returns_none(tmp_path):
    case = seated("daughter")
    case.seat.advisor_model = ModelRef(provider_id="mock")
    assert resolve_advisor(case, MOCK_SETTINGS, ProviderStore(tmp_path / "none.json")) is None
    case.seat.advisor_model = None
    assert resolve_advisor(case, MOCK_SETTINGS, ProviderStore(tmp_path / "empty.json")) is None


def test_resolve_advisor_ready_provider(tmp_path):
    case = seated("daughter")
    case.seat.advisor_model = ModelRef(provider_id="qwen", model="qwen-plus")
    client, label = resolve_advisor(case, MOCK_SETTINGS, _store(tmp_path))
    assert isinstance(client, LLMClient)
    assert "Qwen" in label


def test_complete_schema_repairs_once_then_succeeds():
    payload = {"rows": [{"member_id": "son", "strategy_summary": "争房", "threat_level": "high", "rationale": "学区房"}]}
    responses = iter(["not-json", json.dumps(payload)])

    async def fake(_client, _messages):
        return next(responses)

    out = asyncio.run(complete_schema(object(), [{"role": "user", "content": "x"}], MatrixSummaryOut, complete=fake))
    assert out.rows[0].member_id == "son"


def test_complete_schema_two_failures_raise():
    async def fake(_client, _messages):
        return "still not json"

    with pytest.raises(AdvisorUnavailable):
        asyncio.run(complete_schema(object(), [{"role": "user", "content": "x"}], MatrixSummaryOut, complete=fake))


def test_advisor_schemas_forbid_unknown_and_overlong():
    with pytest.raises(ValidationError):
        BriefOut.model_validate({"baseline": [{"text": "ok"}], "extra": 1})
    with pytest.raises(ValidationError):
        BriefOut.model_validate({"baseline": [{"text": "x" * 161}]})
    with pytest.raises(ValidationError):
        MatrixSummaryOut.model_validate({
            "rows": [{"member_id": "a", "strategy_summary": "s" * 81, "threat_level": "low", "rationale": "r"}]
        })
    CardsOut.model_validate({
        "cards": [
            {"title": "开场", "text": "先报法定份额", "responds_to": None, "action": "propose", "claims": {}, "suggests_admission": None, "serves": "baseline-0", "risk_note": ""},
            {"title": "防守", "text": "不自认", "responds_to": "son", "action": "ally", "claims": {}, "suggests_admission": None, "serves": "risks-0", "risk_note": "勿自认"},
        ]
    })
    with pytest.raises(ValidationError):
        CardsOut.model_validate({
            "cards": [
                {"title": "开场", "text": "先报法定份额", "action": "threaten"},
                {"title": "防守", "text": "守住底线", "action": "propose"},
            ]
        })
    MetaOut.model_validate({"action": "propose", "target": None, "claims": {"house": 50}})
    DebriefOut.model_validate({"soft_scores": {}, "custom_red_lines": {}, "narrative": "复盘", "next_time": []})
    with pytest.raises(ValidationError):
        DebriefOut.model_validate({
            "soft_scores": {"daughter": {"0": 1.2}},
            "custom_red_lines": {},
            "narrative": "复盘",
            "next_time": [],
        })


@pytest.mark.parametrize(
    "soft_scores,custom_red_lines",
    [
        ({"daughter": {"0": 1.0}}, {"daughter": {"0": True, "1": True}}),
        ({"daughter": {"0": 1.0, "00": 0.5, "1": 1.0}}, {"daughter": {"0": True, "1": True}}),
        ({"daughter": {"0": 1.0, "1": 1.0}, "intruder": {"0": 1.0}}, {"daughter": {"0": True, "1": True}}),
        ({"daughter": {"0": 1.0, "1": 1.0}}, {"daughter": {"0": True, "9": True}}),
    ],
)
def test_debrief_rejects_missing_duplicate_alias_extra_member_and_illegal_indexes(
    soft_scores, custom_red_lines,
):
    case = seated("daughter")
    goals = {
        "daughter": Goals(
            soft_goals=[SoftGoal(kind="recognition"), SoftGoal(kind="custom", text="保持体面")],
            red_lines=[
                RedLine(kind="custom", text="不公开羞辱"),
                RedLine(kind="custom", text="不出售纪念物"),
            ],
            source="user",
        )
    }
    payload = {
        "soft_scores": soft_scores,
        "custom_red_lines": custom_red_lines,
        "rationales": {},
        "narrative": "复盘",
        "next_time": [],
    }

    async def fake(_client, _messages):
        return json.dumps(payload, ensure_ascii=False)

    with pytest.raises(AdvisorUnavailable):
        asyncio.run(generate_debrief(
            object(), case, compute_legal_shares(case), {}, "", goals, [], "daughter", complete=fake,
        ))


def test_debrief_accepts_exact_complete_score_indexes():
    case = seated("daughter")
    goals = {
        "daughter": Goals(
            soft_goals=[SoftGoal(kind="recognition"), SoftGoal(kind="custom", text="保持体面")],
            red_lines=[RedLine(kind="custom", text="不公开羞辱")],
            source="user",
        )
    }
    payload = {
        "soft_scores": {"daughter": {"0": 0.5, "1": 1.0}},
        "custom_red_lines": {"daughter": {"0": True}},
        "rationales": {},
        "narrative": "复盘",
        "next_time": [],
    }

    async def fake(_client, _messages):
        return json.dumps(payload, ensure_ascii=False)

    result = asyncio.run(generate_debrief(
        object(), case, compute_legal_shares(case), {}, "", goals, [], "daughter", complete=fake,
    ))
    assert set(result.soft_scores["daughter"]) == {"0", "1"}
    assert set(result.custom_red_lines["daughter"]) == {"0"}
