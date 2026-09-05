import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.legal import compute_legal_shares  # noqa: E402
from app.models import Asset, CaseInput, Member  # noqa: E402


def _case(members, assets=None, **kw):
    assets = assets or [Asset(id="cash", name="存款", type="cash", value=300)]
    return CaseInput(decedent_name="老王", assets=assets, members=members, **kw)


def _pct(result, member_id):
    return next(s.percent for s in result.shares if s.member_id == member_id)


def test_spouse_and_two_children_equal_thirds():
    r = compute_legal_shares(_case([
        Member(id="w", name="妻子", relation="spouse"),
        Member(id="s", name="儿子", relation="son"),
        Member(id="d", name="女儿", relation="daughter"),
    ]))
    assert r.order_used == 1
    for mid in ("w", "s", "d"):
        assert abs(_pct(r, mid) - 33.33) < 0.05
    assert "1127" in r.articles and "1130" in r.articles


def test_community_property_is_split_before_inheritance():
    r = compute_legal_shares(_case(
        [Member(id="w", name="妻子", relation="spouse"), Member(id="s", name="儿子", relation="son")],
        assets=[Asset(id="h", name="房子", type="house", value=400, joint=True)],
    ))
    assert r.community_deduction == 200
    assert r.estate_total == 200
    assert "1153" in r.articles


def test_per_stirpes_representation():
    r = compute_legal_shares(_case([
        Member(id="s", name="儿子", relation="son", deceased=True),
        Member(id="d", name="女儿", relation="daughter"),
        Member(id="g1", name="孙子", relation="grandchild", parent_id="s"),
        Member(id="g2", name="孙女", relation="grandchild", parent_id="s"),
    ]))
    assert abs(_pct(r, "d") - 50) < 0.01
    assert abs(_pct(r, "g1") - 25) < 0.01
    assert abs(_pct(r, "g2") - 25) < 0.01
    assert "1128" in r.articles
    son = next(s for s in r.shares if s.member_id == "s")
    assert son.eligible is False


def test_grandchild_with_living_parent_gets_nothing():
    r = compute_legal_shares(_case([
        Member(id="s", name="儿子", relation="son"),
        Member(id="g1", name="孙子", relation="grandchild", parent_id="s"),
    ]))
    assert _pct(r, "s") == 100
    assert _pct(r, "g1") == 0


def test_second_order_when_no_first_order():
    r = compute_legal_shares(_case([
        Member(id="b", name="哥哥", relation="sibling"),
        Member(id="gp", name="奶奶", relation="grandparent"),
        Member(id="ex", name="前任", relation="ex_spouse"),
    ]))
    assert r.order_used == 2
    assert abs(_pct(r, "b") - 50) < 0.01
    assert _pct(r, "ex") == 0


def test_1130_adjustments_reorder_shares():
    r = compute_legal_shares(_case([
        Member(id="s", name="儿子", relation="son", neglect=True),
        Member(id="d", name="女儿", relation="daughter", main_support=True, cohabit=True),
    ]))
    assert _pct(r, "d") > _pct(r, "s")
    assert abs(_pct(r, "d") + _pct(r, "s") - 100) < 0.01


def test_widowed_daughter_in_law_with_main_support_is_first_order():
    r = compute_legal_shares(_case([
        Member(id="dil", name="儿媳", relation="daughter_in_law", main_support=True),
        Member(id="d", name="女儿", relation="daughter"),
    ]))
    dil = next(s for s in r.shares if s.member_id == "dil")
    assert dil.eligible and dil.order == 1
    assert _pct(r, "dil") > _pct(r, "d")  # 尽主要赡养义务，依 1130 多分
    assert abs(_pct(r, "dil") + _pct(r, "d") - 100) < 0.01
    assert "1129" in r.articles


def test_pet_ai_twin_and_disqualified_are_excluded_but_dependent_gets_carveout():
    r = compute_legal_shares(_case([
        Member(id="s", name="儿子", relation="son", disqualified=True),
        Member(id="d", name="女儿", relation="daughter"),
        Member(id="cat", name="橘猫", relation="pet"),
        Member(id="ai", name="老王 2.0", relation="ai_twin"),
        Member(id="nanny", name="保姆", relation="dependent", main_support=True),
    ]))
    assert _pct(r, "s") == 0
    assert _pct(r, "cat") == 0
    assert _pct(r, "ai") == 0
    assert _pct(r, "nanny") == 5
    assert abs(_pct(r, "d") - 95) < 0.01
    assert "1125" in r.articles and "1131" in r.articles


def test_shares_always_sum_to_100():
    r = compute_legal_shares(_case([
        Member(id="w", name="妻子", relation="spouse", cohabit=True),
        Member(id="s", name="儿子", relation="son", neglect=True),
        Member(id="d", name="女儿", relation="daughter", hardship=True),
        Member(id="m", name="母亲", relation="mother"),
        Member(id="nanny", name="保姆", relation="dependent", main_support=True),
    ]))
    assert abs(sum(s.percent for s in r.shares) - 100) < 0.1
