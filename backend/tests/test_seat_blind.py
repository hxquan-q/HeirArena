import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.role_agents import DEBATER_RULES, _debater_system  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import (  # noqa: E402
    Brief,
    BriefItem,
    GameTables,
    Goals,
    Reachability,
    RedLine,
    SeatConfig,
    StrategyPack,
)
from app.seat.prompts import seat_secret_strings  # noqa: E402
from tests.seat_fixtures import cat_case  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS  # noqa: E402

BRIEF_MARK = "策略简报"
BRIEF_HEADER = "【你的策略简报（私有，只有你看得到）】"
BRIEF_FOOTER = "语气按你的人设，策略按本简报；凡涉及自认、放弃、确认他人扶养与资产诉求，以简报为准。"


def _item(item_id: str, text: str, enabled: bool = True) -> BriefItem:
    return BriefItem(id=item_id, text=text, enabled=enabled)


def _pack(briefs: dict[str, Brief], player_id: str = "daughter") -> StrategyPack:
    return StrategyPack(
        player_id=player_id,
        matrix=[],
        briefs=briefs,
        game=GameTables(),
        reachability=Reachability(legal_pct=30, low=20, high=40),
        whatif=[],
    )


def _orch(case):
    legal = compute_legal_shares(case)
    return Orchestrator(build_session(case, legal, MOCK_SETTINGS))


def _with_seat(*, goals: dict[str, Goals] | None = None, strategy: StrategyPack | None = None):
    return cat_case().model_copy(update={
        "seat": SeatConfig(player_id="daughter", goals=goals or {}, strategy=strategy),
    })


def _seated_case():
    daughter = Brief(
        member_id="daughter",
        baseline=[_item("d-b1", "DAUGHTER_BASELINE_ONLY")],
        levers=[_item("d-off", "DAUGHTER_DISABLED", enabled=False)],
        risks=[_item("d-r1", "DAUGHTER_RISK_ONLY")],
    )
    son = Brief(member_id="son", baseline=[_item("s-b1", "SON_BASELINE_ONLY")])
    return _with_seat(
        goals={
            "daughter": Goals(
                narrative="SENTINEL_PLAYER_ONLY",
                min_value_share=67.3,
                red_lines=[RedLine(kind="custom", text="SENTINEL_RED_LINE")],
                source="user",
            ),
            "son": Goals(narrative="SENTINEL_SON_EDITED", source="user"),
        },
        strategy=_pack({"daughter": daughter, "son": son}),
    )


def test_observer_debater_prompts_have_no_brief():
    orch = _orch(cat_case())
    daughter = orch.members["daughter"]
    system = _debater_system(orch, "daughter")
    messages = orch._debater_messages(daughter, "statements", 0, None, None)
    msg_system = messages[0]["content"]
    assert BRIEF_MARK not in system
    assert BRIEF_MARK not in msg_system
    assert system.split("【你的心愿】", 1)[1].startswith(orch.specs["daughter"].wish + "\n" + DEBATER_RULES)
    after_wish = msg_system.split("【你的心愿】", 1)[1]
    assert after_wish.startswith(orch.specs["daughter"].wish + "\n【剧情背景")
    assert orch.seat_brief_text("daughter") == ""


def test_player_and_opponent_briefs_are_isolated():
    orch = _orch(_seated_case())
    player_sys = _debater_system(orch, "daughter")
    son_sys = _debater_system(orch, "son")
    player_msg = orch._debater_messages(orch.members["daughter"], "debate", 1, None, None)[0]["content"]
    son_msg = orch._debater_messages(orch.members["son"], "debate", 1, None, None)[0]["content"]

    for text in (player_sys, player_msg):
        assert BRIEF_HEADER in text
        assert BRIEF_FOOTER in text
        assert "DAUGHTER_BASELINE_ONLY" in text
        assert "DAUGHTER_RISK_ONLY" in text
        assert "DAUGHTER_DISABLED" not in text
        assert "SON_BASELINE_ONLY" not in text

    for text in (son_sys, son_msg):
        assert "SON_BASELINE_ONLY" in text
        assert "DAUGHTER_BASELINE_ONLY" not in text
        assert "DAUGHTER_RISK_ONLY" not in text


def test_executor_prompts_are_seat_blind():
    orch = _orch(_seated_case())
    secrets = seat_secret_strings(orch.case)
    assert "SENTINEL_PLAYER_ONLY" in secrets
    assert "SENTINEL_RED_LINE" in secrets
    assert "SENTINEL_SON_EDITED" in secrets
    samples = orch.executor_prompt_samples()
    assert len(samples) == 5
    for text in samples:
        assert "简报" not in text
        for secret in secrets:
            assert secret not in text
        assert "self.case.seat" not in text


def test_brief_truncates_to_25_keeping_risks():
    baseline = [_item(f"b{i}", f"BASE_{i}") for i in range(20)]
    risks = [_item(f"r{i}", f"RISK_{i}") for i in range(10)]
    long_item = BriefItem.model_construct(id="long", text="Z" * 200)
    case = _with_seat(strategy=_pack({
        "daughter": Brief(
            member_id="daughter",
            baseline=baseline + [long_item],
            risks=risks,
        ),
    }))
    text = _orch(case).seat_brief_text("daughter")
    present = [i for i in range(20) if f"BASE_{i}" in text]
    risk_hits = [i for i in range(10) if f"RISK_{i}" in text]
    assert len(risk_hits) == 10
    assert len(present) + len(risk_hits) <= 25
    assert "Z" * 161 not in text
    assert text.count("Z") <= 160
