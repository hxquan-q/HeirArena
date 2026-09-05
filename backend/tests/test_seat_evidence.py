import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.legal import ARTICLES, EVIDENCE_TABLE, hint_for, hints_for_member  # noqa: E402
from app.models import Member  # noqa: E402


REQUIRED = {"main_support", "cohabit", "hardship", "neglect", "dependency", "disqualified", "deceased", "joint"}


def test_articles_exist_and_evidence_long_enough():
    for lever, hint in EVIDENCE_TABLE.items():
        assert hint.article in ARTICLES, lever
        assert len(hint.evidence) >= 3
        assert hint.burden


def test_engine_levers_are_covered():
    assert REQUIRED <= set(EVIDENCE_TABLE)


def test_hints_for_member_identity():
    spouse = Member(id="w", name="妻", relation="spouse")
    dil = Member(id="d", name="媳", relation="daughter_in_law")
    dep = Member(id="n", name="保姆", relation="dependent")
    pet = Member(id="p", name="猫", relation="pet")
    assert any(h.lever == "joint" for h in hints_for_member(spouse))
    assert any(h.lever == "inlaw_support" for h in hints_for_member(dil))
    assert any(h.lever == "dependent_support" for h in hints_for_member(dep))
    assert hints_for_member(pet) == []
    assert hint_for("main_support") is not None
