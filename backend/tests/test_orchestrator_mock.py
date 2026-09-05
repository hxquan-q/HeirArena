import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.allocator import allocate, default_preferences, settle_compensations, value_shares  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Asset, CaseInput, Member  # noqa: E402

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
    v = session.verdict
    assert v and abs(sum(v["targets"].values()) - 100) < 0.2
    assert set(v["targets"]) == {"wife", "son", "daughter"}
    assert v["conditions"], "宠物应附照护条件"
    full_text = "".join(e["text"] for e in session.events if e["type"] == "speech_delta")
    assert "".join(t.text for t in session.transcript) == full_text
