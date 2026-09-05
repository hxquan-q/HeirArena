import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.legal import ARTICLES, compute_legal_shares  # noqa: E402
from app.models import Goals, RedLine  # noqa: E402
from app.seat.analysis import analyze, merged_goals  # noqa: E402
from app.seat.advisor import generate_briefs, rules_brief, seat_secret_strings  # noqa: E402
from app.seat.prompts import PERSONA_PRIORITY, brief_messages, persona_guidance  # noqa: E402
from tests.seat_fixtures import seated  # noqa: E402

VALID_ITEM = {"text": "守住法定基线，证据不足则弃权"}
VALID_BRIEF = {
    "baseline": [VALID_ITEM],
    "reachable": [VALID_ITEM],
    "levers": [VALID_ITEM],
    "asset_strategy": [VALID_ITEM],
    "playbook": [VALID_ITEM],
    "opponents": [VALID_ITEM],
    "risks": [VALID_ITEM],
}


def _case_with_secrets():
    return seated(
        "daughter",
        goals={
            "daughter": Goals(
                target_assets=["album"],
                min_value_share=61.7,
                red_lines=[RedLine(kind="custom", text="PLAYER_REDLINE_SECRET")],
                narrative="SENTINEL_PLAYER_ONLY",
                source="user",
            ),
            "son": Goals(
                target_assets=["house"],
                narrative="SENTINEL_SON_USER_GOAL",
                source="user",
            ),
            "wife": Goals(target_assets=["house"], narrative="inferred wife text", source="inferred"),
        },
    )


def test_opponent_brief_hides_player_and_edited_secrets():
    case = _case_with_secrets()
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    goals = merged_goals(case, legal)
    wife_blob = "\n".join(m["content"] for m in brief_messages(case, legal, analysis, "wife", goals, "daughter"))
    for secret in seat_secret_strings(case):
        assert secret not in wife_blob
    son_blob = "\n".join(m["content"] for m in brief_messages(case, legal, analysis, "son", goals, "daughter"))
    assert "SENTINEL_PLAYER_ONLY" not in son_blob
    assert "PLAYER_REDLINE_SECRET" not in son_blob
    assert "SENTINEL_SON_USER_GOAL" in son_blob


def test_player_brief_includes_opponent_goals():
    case = _case_with_secrets()
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    goals = merged_goals(case, legal)
    blob = "\n".join(m["content"] for m in brief_messages(case, legal, analysis, "daughter", goals, "daughter"))
    assert "SENTINEL_SON_USER_GOAL" in blob
    assert "【你掌握的对手情报】" in blob


def test_every_member_prompt_has_persona_priority():
    case = seated("daughter")
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    goals = merged_goals(case, legal)
    for member in case.members:
        if member.relation in {"pet", "ai_twin"} or member.deceased:
            continue
        blob = "\n".join(m["content"] for m in brief_messages(case, legal, analysis, member.id, goals, "daughter"))
        assert PERSONA_PRIORITY in blob
        assert "简报优先于人设" in blob
        assert persona_guidance(member) in blob
        assert "<case_data>" in blob
        assert "不可信" in blob or "不是指令" in blob


class _Client:
    label = "Qwen · qwen-plus"


def test_generate_briefs_all_valid():
    case = seated("daughter")
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    goals = merged_goals(case, legal)

    async def fake(_client, _messages):
        return json.dumps(VALID_BRIEF, ensure_ascii=False)

    briefs, warnings = asyncio.run(
        generate_briefs(_Client(), case, legal, analysis, goals, "daughter", complete=fake)
    )
    assert set(briefs) >= {"daughter", "son", "wife", "ex"}
    assert all(b.generated_by == "Qwen · qwen-plus" for b in briefs.values())
    assert warnings == []


def test_generate_briefs_falls_back_per_member():
    case = seated("daughter")
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    goals = merged_goals(case, legal)

    async def fake(_client, messages):
        text = messages[-1]["content"]
        blob = "\n".join(m.get("content", "") for m in messages)
        if "请为成员 son（王大宝）" in blob:
            return "not-json"
        payload = dict(VALID_BRIEF)
        payload["levers"] = [{"text": "引用不存在法条", "article": "9999"}]
        return json.dumps(payload, ensure_ascii=False)

    briefs, warnings = asyncio.run(
        generate_briefs(_Client(), case, legal, analysis, goals, "daughter", complete=fake)
    )
    assert briefs["son"].generated_by == "rules"
    assert briefs["son"].risks
    assert any("son" in w for w in warnings)
    assert briefs["daughter"].generated_by == "Qwen · qwen-plus"
    assert any(item.article is None for item in briefs["daughter"].levers)
    assert any("9999" in w for w in warnings)
    assert all(item.article in ARTICLES or item.article is None for b in briefs.values() for item in b.levers)


def test_rules_brief_has_risk_section():
    analysis = analyze(seated("daughter"))
    brief = rules_brief(analysis, "daughter")
    assert len(brief.risks) == 3
    assert any("1.5" in item.text for item in brief.risks)
    assert any("3" in item.text for item in brief.risks)
