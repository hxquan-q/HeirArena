import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.legal import ARTICLES, compute_legal_shares  # noqa: E402
from app.models import Goals  # noqa: E402
from app.seat.analysis import infer_all_goals, infer_goals, reachability, toggleable_facts, whatif  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402


def test_cat_daughter_toggles_and_whatif_direction():
    case = seated()
    snapshot = case.model_dump()
    keys = {t.key for t in toggleable_facts(case, "daughter")}
    assert "main_support:daughter" not in keys
    assert "neglect:son" not in keys
    joint = next(t for t in toggleable_facts(case, "daughter") if t.key == "joint:house")
    assert joint.current_value is True

    deltas = whatif(case, "daughter")
    house = next(d for d in deltas if d.key == "joint:house")
    assert (house.direction == "favorable") == (house.delta_pct > 0)
    for row in deltas:
        assert row.article in ARTICLES
        assert row.evidence
    assert case.model_dump() == snapshot


def test_reachability_bounds_and_value_interval():
    r = reachability(seated(), "daughter")
    assert r.low <= r.legal_pct <= r.high
    assert r.value_low is not None and r.value_high is not None
    assert r.value_low <= r.value_high


def test_ex_spouse_has_zero_legal_and_does_not_raise():
    case = seated("ex")
    r = reachability(case, "ex")
    assert r.legal_pct == 0
    whatif(case, "ex")


def test_infer_goals_cat_preset():
    case = cat_case()
    legal = compute_legal_shares(case)
    son = infer_goals(case, "son", legal)
    assert son.target_assets[0] == "house"
    son_pct = next(s.percent for s in legal.shares if s.member_id == "son")
    assert son.min_value_share == float(round(son_pct))
    daughter = infer_goals(case, "daughter", legal)
    kinds = {(rl.kind, rl.asset_id) for rl in daughter.red_lines} | {
        (sg.kind, sg.asset_id) for sg in daughter.soft_goals
    }
    assert ("no_sell_asset", "album") in kinds or ("pet_custody", "cat") in kinds


def test_ex_and_non_person_goals():
    case = cat_case()
    legal = compute_legal_shares(case)
    ex = infer_goals(case, "ex", legal)
    assert ex.target_assets
    assert ex.min_value_share is None
    assert all(rl.kind != "not_below_legal" for rl in ex.red_lines)
    assert infer_goals(case, "cat_agent", legal) == Goals()
    assert infer_goals(case, "ai", legal) == Goals()


def test_user_goals_are_not_overwritten():
    user = Goals(target_assets=["btc"], narrative="只要币", source="user")
    case = seated(goals={"son": user})
    legal = compute_legal_shares(case)
    out = infer_all_goals(case, legal, "daughter")
    assert out["son"].source == "user"
    assert out["son"].target_assets == ["btc"]
    assert "daughter" not in out
