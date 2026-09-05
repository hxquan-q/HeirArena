import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.allocator import allocate, default_preferences, settle_compensations, value_shares  # noqa: E402
from app.agents.court_graph import set_checkpointer  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Asset, CaseInput, Member  # noqa: E402
from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

MOCK_SETTINGS = Settings(api_key="", base_url="", model="", temperature=0.9, timeout=5, force_mock=True)


def sample_case() -> CaseInput:
    return CaseInput(
        decedent_name="老王",
        story="儿子五年没回家，女儿一直照顾我，我最爱那只橘猫。",
        assets=[
            Asset(id="house", name="学区房", type="house", value=600, joint=True),
            Asset(id="btc", name="比特币", type="crypto", value=120),
            Asset(id="cash", name="银行存款", type="cash", value=80),
            Asset(id="cat", name="橘猫大橘", type="pet", value=1),
            Asset(id="album", name="老相册", type="collectible", value=0.5, sentimental=True),
        ],
        members=[
            Member(id="wife", name="李阿姨", relation="spouse", personality="drama", cohabit=True),
            Member(id="son", name="王大宝", relation="son", personality="greedy", neglect=True),
            Member(id="daughter", name="王小美", relation="daughter", personality="filial", main_support=True),
            Member(id="ex", name="前妻张姐", relation="ex_spouse", personality="lawyer"),
            Member(id="cat_agent", name="大橘", relation="pet", personality="loyal"),
            Member(id="ai", name="老王 2.0", relation="ai_twin", personality="mischief"),
        ],
        rounds=1, speed=4.0,
    )


def test_allocator_matches_targets_and_sums_to_100():
    case = sample_case()
    legal = compute_legal_shares(case)
    targets = {sh.member_id: sh.percent for sh in legal.shares if sh.percent > 0}
    alloc = allocate(case, legal, targets, default_preferences(case.members, case.assets))
    for a in case.assets:
        assert abs(sum(alloc[a.id].values()) - 100) < 0.11, (a.id, alloc[a.id])
    comps = settle_compensations(case, legal, alloc, targets)
    shares = value_shares(case, legal, alloc, comps)
    for mid, pct in targets.items():
        assert abs(shares.get(mid, 0) - pct) < 3, (mid, shares.get(mid), pct, comps)
    # 学区房整套归一人，超出部分以折价补偿找平
    assert comps, "应产生折价补偿"
    # 配偶拿到共同财产的一半以上
    assert alloc["house"]["wife"] >= 50
    # 猫归孝顺女儿
    assert max(alloc["cat"], key=alloc["cat"].get) == "daughter"


def test_full_mock_session_produces_verdict(monkeypatch):
    case = sample_case()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, MOCK_SETTINGS)

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)
    asyncio.run(Orchestrator(session).run())

    types = [e["type"] for e in session.events]
    assert types[0] == "session_start"
    assert types[-1] == "done"
    assert "verdict" in types and "gavel" in types
    assert types.count("phase") == 5  # opening, statements, debate x1, negotiation, verdict
    speakers = {e["agent_id"] for e in session.events if e["type"] == "speech_end"}
    assert {"executor", "wife", "son", "daughter", "ex", "cat_agent", "ai"} <= speakers
    assert any(e["type"] == "relation" for e in session.events)
    # 争议焦点：陈述结束后归纳并广播，辩论轮围绕焦点推进
    focus_events = [e for e in session.events if e["type"] == "focus"]
    assert focus_events and 2 <= len(focus_events[0]["issues"]) <= 4
    v = session.verdict
    assert v and abs(sum(v["targets"].values()) - 100) < 0.2
    assert set(v["targets"]) == {"wife", "son", "daughter"}
    assert v["conditions"], "宠物应附照护条件"
    # 判决书三段式（规则兜底也必须有）
    jd = v["judgment"]
    assert jd["findings"] and jd["reasoning"] and jd["orders"]
    assert jd["reasoning"].startswith("本院认为")
    assert any("、" in o for o in jd["orders"])
    # 漏接分析与和解建议（mock 模式为规则兜底骨架）
    assert v["settlement"]["overview"] and len(v["settlement"]["plans"]) == 3
    assert {p["tier"] for p in v["settlement"]["plans"]} == {"A", "B", "C"}
    full_text = "".join(e["text"] for e in session.events if e["type"] == "speech_delta")
    assert "".join(t.text for t in session.transcript) == full_text


def test_rule_judgment_and_settlement_fallbacks():
    case = sample_case()
    orch = Orchestrator(build_session(case, compute_legal_shares(case), MOCK_SETTINGS))
    jd = orch._rule_judgment([], [])
    assert jd["findings"].startswith("经审理查明") and jd["reasoning"].startswith("本院认为")
    assert all(o for o in jd["orders"])
    st = orch._rule_settlement({"wife": 40.0, "son": 30.0, "daughter": 30.0})
    assert len(st["plans"]) == 3 and all(p["detail"] for p in st["plans"])
    # 合并逻辑：LLM 半成品字段用规则兜底补齐，不整体丢弃
    partial = {"judgment": {"orders": ["一、全部归我"]}, "settlement": {"plans": [{"tier": "B", "detail": "x"}]}}
    merged_jd = orch._merge_judgment(partial["judgment"], jd)
    assert merged_jd["orders"] == ["一、全部归我"] and merged_jd["findings"] == jd["findings"]
    merged_st = orch._merge_settlement(partial["settlement"], st)
    assert merged_st["plans"][0]["tier"] == "B" and merged_st["overview"] == st["overview"]
    # 漏接分析：只接受真实出席者
    ua = orch._sanitize_unaddressed([
        {"member_id": "son", "strongest": "s", "missed": "m"},
        {"member_id": "ghost_member", "strongest": "x", "missed": "y"},
        {"member_id": "son", "strongest": "dup", "missed": ""},
        "not-a-dict",
    ])
    assert len(ua) == 1 and ua[0]["member_id"] == "son"


def test_four_round_twelve_role_session_reaches_verdict(monkeypatch):
    set_checkpointer(InMemorySaver())
    case = sample_case()
    case.members.extend(
        Member(id=f"friend_{i}", name=f"朋友{i}", relation="friend")
        for i in range(6)
    )
    case.rounds = 4
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)
    asyncio.run(Orchestrator(session).run())

    assert session.status == "done"
    assert session.verdict
