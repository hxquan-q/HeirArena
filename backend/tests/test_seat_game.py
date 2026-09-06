import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.legal import compute_legal_shares  # noqa: E402
from app.models import Asset, CaseInput, Goals, Member, SeatConfig  # noqa: E402
from app.seat.analysis import infer_goals, merged_goals  # noqa: E402
from app.seat.game import build_game_tables, options_for, payoffs_for_profile  # noqa: E402
from tests.seat_fixtures import seated  # noqa: E402


def test_cat_daughter_game_tables():
    case = seated()
    legal = compute_legal_shares(case)
    goals = merged_goals(case, legal)
    if "house" not in goals.get("daughter", Goals()).target_assets:
        goals["daughter"] = Goals(
            target_assets=["cat", "album", "house"],
            source="inferred",
        )
    tables = build_game_tables(case, legal, goals, "daughter")
    house = next(r for r in tables.asset_competition if r.asset_id == "house")
    assert "son" in house.competitors and "daughter" in house.competitors
    assert house.predicted_winner in house.competitors

    assert 2 <= len(tables.payoff) <= 8
    claim = next(r for r in tables.payoff if "学区房" in r.label and "让步" not in r.label)
    if "house" in claim.assets_obtained:
        assert claim.compensation_paid > 0 or claim.my_value_share >= 0

    for row in tables.coalition:
        assert row.member_id not in row.potential_confirmers
        assert "cat_agent" not in row.potential_confirmers
        assert "ai" not in row.potential_confirmers


def test_cat_equilibrium_stable_or_note_under_200ms():
    case = seated()
    legal = compute_legal_shares(case)
    goals = merged_goals(case, legal)
    started = time.perf_counter()
    tables = build_game_tables(case, legal, goals, "daughter")
    elapsed = time.perf_counter() - started
    assert tables.equilibrium
    assert elapsed < 0.2
    assert any(row.stable for row in tables.equilibrium) or tables.equilibrium[0].note


def test_stable_profiles_resist_unilateral_deviation():
    case = seated()
    legal = compute_legal_shares(case)
    goals = merged_goals(case, legal)
    tables = build_game_tables(case, legal, goals, "daughter")
    stables = [row for row in tables.equilibrium if row.stable]
    if not stables:
        assert tables.equilibrium[0].note
        return
    sample = random.Random(31).sample(stables, min(3, len(stables)))
    heirs = [mid for mid in sample[0].profile]
    for row in sample:
        for mid in heirs:
            for option in options_for(mid, goals, case):
                if option.label == row.profile[mid]:
                    continue
                trial = dict(row.profile)
                trial[mid] = option.label
                payoffs, _ = payoffs_for_profile(case, legal, trial, goals)
                assert payoffs.get(mid, 0) <= row.payoffs.get(mid, 0) + 0.05 + 1e-9


def test_more_than_six_heirs_truncates():
    members = [Member(id="wife", name="妻", relation="spouse")]
    members += [Member(id=f"c{i}", name=f"子女{i}", relation="son") for i in range(6)]
    case = CaseInput(
        decedent_name="老周",
        assets=[Asset(id="cash", name="存款", type="cash", value=700)],
        members=members,
        seat=SeatConfig(player_id="wife", goals={}),
    )
    legal = compute_legal_shares(case)
    goals = merged_goals(case, legal)
    started = time.perf_counter()
    tables = build_game_tables(case, legal, goals, "wife")
    elapsed = time.perf_counter() - started
    assert elapsed < 2.0
    assert tables.equilibrium
    assert any("前 6" in row.note or "截断" in row.note for row in tables.equilibrium)


def test_ex_payoff_is_zero_and_safe():
    case = seated("ex")
    legal = compute_legal_shares(case)
    goals = {"ex": infer_goals(case, "ex", legal)}
    tables = build_game_tables(case, legal, goals, "ex")
    assert tables.payoff
    assert all(r.my_value == 0 and r.my_value_share == 0 for r in tables.payoff)
