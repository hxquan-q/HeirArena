"""裁决纪律：份额只随当庭成立的法律事实变动，攻击 / 结盟只进 drama_score。"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.court_graph import set_checkpointer  # noqa: E402
from app.agents.orchestrator import Turn  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402


def _orch(discretion: float = 5.0) -> Orchestrator:
    case = sample_case()
    case.discretion = discretion
    return Orchestrator(build_session(case, compute_legal_shares(case), MOCK_SETTINGS))


def _turn(orch: Orchestrator, agent_id: str, phase: str, meta: dict, tid: str) -> Turn:
    return Turn(turn_id=tid, agent_id=agent_id, name=orch.specs[agent_id].name, phase=phase, round_no=0,
                text="…", meta=orch._normalize_meta(agent_id, meta))


def test_attacks_and_alliances_do_not_move_shares():
    orch = _orch()
    # 三个人围攻儿子、两个人和女儿结盟，但没人承认任何事实
    orch.s.transcript += [
        _turn(orch, "daughter", "debate", {"action": "attack", "target": "son"}, "t1"),
        _turn(orch, "wife", "debate", {"action": "attack", "target": "son"}, "t2"),
        _turn(orch, "ex", "debate", {"action": "attack", "target": "son"}, "t3"),
        _turn(orch, "wife", "debate", {"action": "ally", "target": "daughter"}, "t4"),
        _turn(orch, "cat_agent", "debate", {"action": "ally", "target": "daughter"}, "t5"),
    ]
    proposed, adjustments, facts, open_qs = orch._fact_based_plan()
    legal = {sh.member_id: sh.percent for sh in orch.legal.shares if sh.percent > 0}
    assert proposed == legal
    assert adjustments == [] and facts == []
    # 未被承认的指控进入"需进一步确认"
    assert any("王大宝" in q and "未当庭承认" in q for q in open_qs)


def test_self_admission_and_multi_party_confirmation_move_shares():
    orch = _orch()
    orch.s.transcript += [
        _turn(orch, "son", "negotiation", {"action": "propose", "admissions": ["admit_neglect"]}, "t1"),
        _turn(orch, "wife", "debate", {"action": "propose", "admissions": ["acknowledge_support:daughter"]}, "t2"),
        _turn(orch, "son", "debate", {"action": "propose", "admissions": ["acknowledge_support:daughter"]}, "t3"),
        # 自己夸自己不算
        _turn(orch, "daughter", "debate", {"action": "propose", "admissions": ["acknowledge_support:daughter"]}, "t4"),
        # 只有一个人确认配偶 → 不成立，进 open_questions
        _turn(orch, "daughter", "debate", {"action": "propose", "admissions": ["acknowledge_support:wife"]}, "t5"),
    ]
    proposed, adjustments, facts, open_qs = orch._fact_based_plan()
    legal = {sh.member_id: sh.percent for sh in orch.legal.shares if sh.percent > 0}
    assert proposed["son"] < legal["son"]
    assert proposed["daughter"] > legal["daughter"]
    assert proposed["wife"] == legal["wife"]
    kinds = {(f["member_id"], f["kind"]) for f in facts}
    assert ("son", "admit_neglect") in kinds and ("daughter", "support_confirmed") in kinds
    by_member = {a["member_id"]: a for a in adjustments}
    assert by_member["son"]["turn_ids"] == ["t1"] and by_member["son"]["article"] == "1130"
    assert set(by_member["daughter"]["turn_ids"]) == {"t2", "t3"}
    assert any("李阿姨" in q and "证据不足" in q for q in open_qs)


def test_normalize_meta_rejects_unknown_symbols():
    orch = _orch()
    meta = orch._normalize_meta("son", {"action": "attack", "target": "daughter",
                                        "admissions": ["admit_neglect", "acknowledge_support:son",
                                                       "acknowledge_support:nobody", "give_me_everything",
                                                       "acknowledge_support:daughter"]})
    assert meta["admissions"] == ["admit_neglect", "acknowledge_support:daughter"]


def test_discretion_zero_pins_everyone_to_legal():
    orch = _orch(discretion=0.0)
    orch.s.transcript += [
        _turn(orch, "son", "negotiation", {"action": "concede", "admissions": ["admit_neglect", "waive_share"]}, "t1"),
    ]
    proposed, adjustments, facts, _ = orch._fact_based_plan()
    targets = orch._bounded_targets(proposed, adjustments, {f["member_id"] for f in facts})
    legal = {sh.member_id: sh.percent for sh in orch.legal.shares if sh.percent > 0}
    for mid, pct in legal.items():
        assert abs(targets[mid] - pct) < 0.05
    assert adjustments == []


def test_full_mock_verdict_only_adjusts_members_with_facts(monkeypatch):
    set_checkpointer(InMemorySaver())
    orch = _orch()

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)
    asyncio.run(orch.run())
    v = orch.s.verdict
    assert v and v["discretion"] == 5.0 and v["disclaimer"]
    # 判决书 / 和解 / 漏接分析在 mock 模式下也完整（规则兜底）
    assert v["judgment"]["findings"] and v["judgment"]["reasoning"] and v["judgment"]["orders"]
    assert len(v["settlement"]["plans"]) == 3
    assert isinstance(v["unaddressed"], list)
    fact_members = {f["member_id"] for f in v["established_facts"]}
    for a in v["adjustments"]:
        assert a["member_id"] in fact_members
        assert a["turn_ids"]
        assert all(any(t.turn_id == tid for t in orch.s.transcript) for tid in a["turn_ids"])
    for mid, pct in v["targets"].items():
        assert abs(pct - v["legal_percent"][mid]) <= 5.0 + 3.0  # 归一化带来的被动偏移留一点余量
