import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.allocator import allocate, default_preferences, member_value, settle_compensations, value_shares  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Goals, RedLine  # noqa: E402
from app.seat.scoring import build_scorecard  # noqa: E402
from tests.test_orchestrator_mock import sample_case  # noqa: E402


def _verdict(allocation, value_shares=None, legal=None, targets=None):
    return {
        "allocation": allocation,
        "value_shares": value_shares or {},
        "legal_percent": legal or {},
        "targets": targets or {},
        "established_facts": [],
    }


def test_all_goals_met_without_soft_is_100():
    goals = Goals(
        target_assets=["album"],
        min_value_share=30,
        red_lines=[RedLine(kind="no_sell_asset", asset_id="album")],
    )
    card = build_scorecard(
        goals,
        _verdict(
            {"album": {"daughter": 100}},
            {"daughter": 40},
            {"daughter": 35},
            {"daughter": 40},
        ),
        "daughter",
    )
    assert card.total == 100
    assert card.capped is False


def test_broken_red_line_caps_total_at_40():
    goals = Goals(
        target_assets=["album"],
        min_value_share=30,
        red_lines=[RedLine(kind="no_sell_asset", asset_id="album")],
    )
    card = build_scorecard(
        goals,
        _verdict(
            {"album": {"daughter": 100, "son": 0}, "house": {"wife": 50, "son": 50}},
            {"daughter": 40},
            {"daughter": 35},
            {"daughter": 40},
        ),
        "daughter",
    )
    # 上面 album 仍是 100% 一人，改成拆分以破红线
    card = build_scorecard(
        goals,
        _verdict(
            {"album": {"daughter": 60, "son": 40}},
            {"daughter": 40},
            {"daughter": 35},
            {"daughter": 40},
        ),
        "daughter",
    )
    assert card.total == 40
    assert card.capped is True


def test_only_target_assets_scales_to_100():
    goals = Goals(target_assets=["house"])
    card = build_scorecard(goals, _verdict({"house": {"daughter": 60}}), "daughter")
    assert card.total == 60


def test_custom_red_line_needs_advisor():
    goals = Goals(red_lines=[RedLine(kind="custom", text="不能当众羞辱")])
    bare = build_scorecard(goals, _verdict({}), "daughter")
    red = next(p for p in bare.parts if p.key == "red_lines")
    assert red.applicable is False
    judged = build_scorecard(goals, _verdict({}), "daughter", custom_red_lines={0: True})
    red2 = next(p for p in judged.parts if p.key == "red_lines")
    assert red2.applicable is True
    assert judged.total == 100


def test_missing_player_has_zero_value_share():
    card = build_scorecard(Goals(), _verdict({}, {}, {}, {}), "ghost")
    assert card.value_share == 0
    assert card.total == 0


def test_real_allocator_verdict_from_sample_case():
    case = sample_case()
    legal = compute_legal_shares(case)
    targets = {s.member_id: s.percent for s in legal.shares if s.percent > 0}
    alloc = allocate(case, legal, targets, default_preferences(case.members, case.assets))
    comps = settle_compensations(case, legal, alloc, targets)
    verdict = {
        "allocation": alloc,
        "compensations": comps,
        "targets": targets,
        "value_shares": value_shares(case, legal, alloc, comps),
        "member_value": member_value(case, alloc, comps),
        "legal_percent": {s.member_id: s.percent for s in legal.shares},
        "established_facts": [],
    }
    card = build_scorecard(
        Goals(target_assets=["cat"], min_value_share=20, source="user"),
        verdict,
        "daughter",
    )
    assert 0 <= card.total <= 100
    assert card.formula
