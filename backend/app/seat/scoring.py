"""确定性记分卡：目标资产 / 最低份额 / 红线；软目标与自定义红线可由军师后填。"""
from __future__ import annotations

from ..models import Goals, RedLine, Scorecard, ScorecardPart

FORMULA = "目标资产 40 · 最低份额 30 · 红线 20 · 软目标 10；未设定项不计分，按已设定项换算到 100；红线被破总分上限 40"


def _weights(n: int) -> list[float]:
    if n <= 1:
        return [1.0]
    if n == 2:
        return [0.7, 0.3]
    return [0.6, 0.3, 0.1]


def score_target_assets(goals: Goals, allocation: dict, me: str) -> ScorecardPart:
    targets = goals.target_assets[:3]
    if not targets:
        return ScorecardPart(key="target_assets", label="目标资产", score=0, max=40, applicable=False)
    weights = _weights(len(targets))
    fracs: list[float] = []
    bits: list[str] = []
    for asset_id, weight in zip(targets, weights):
        frac = float(allocation.get(asset_id, {}).get(me, 0)) / 100
        fracs.append(frac)
        bits.append(f"{asset_id} 拿到 {frac * 100:.0f}%")
    score = 40 * sum(w * f for w, f in zip(weights, fracs))
    return ScorecardPart(
        key="target_assets", label="目标资产", score=round(score, 1), max=40,
        detail="；".join(bits),
    )


def score_min_share(goals: Goals, value_shares: dict[str, float], me: str) -> ScorecardPart:
    minimum = goals.min_value_share
    if minimum is None:
        return ScorecardPart(key="min_share", label="最低份额", score=0, max=30, applicable=False)
    vs = float(value_shares.get(me, 0))
    if vs >= minimum:
        score = 30.0
    elif minimum <= 0:
        score = 30.0
    else:
        score = 30 * vs / minimum
    return ScorecardPart(
        key="min_share", label="最低份额", score=round(score, 1), max=30,
        detail=f"价值份额 {vs:.1f}% / 最低 {minimum:.0f}%",
    )


def evaluate_red_line(rl: RedLine, allocation: dict, value_shares: dict[str, float],
                      legal_percent: dict[str, float], me: str) -> bool | None:
    if rl.kind == "custom":
        return None
    if rl.kind == "no_sell_asset" and rl.asset_id:
        row = allocation.get(rl.asset_id, {})
        holders = [mid for mid, pct in row.items() if pct > 0 and mid != "__state__"]
        if not holders or "__state__" in row:
            return False
        return len(holders) == 1 and row.get(holders[0], 0) >= 100
    if rl.kind == "no_member_gets_asset" and rl.asset_id and rl.member_id:
        return allocation.get(rl.asset_id, {}).get(rl.member_id, 0) < 50
    if rl.kind == "not_below_legal":
        return value_shares.get(me, 0) >= legal_percent.get(me, 0) - 0.5
    if rl.kind == "no_co_own_asset" and rl.asset_id and rl.member_id:
        row = allocation.get(rl.asset_id, {})
        return not (row.get(me, 0) > 0 and row.get(rl.member_id, 0) > 0)
    return None


def score_red_lines(goals: Goals, allocation: dict, value_shares: dict[str, float],
                    legal_percent: dict[str, float], me: str,
                    custom_red_lines: dict[int, bool] | None = None) -> tuple[ScorecardPart, bool]:
    evaluated: list[bool] = []
    for i, rl in enumerate(goals.red_lines):
        result = evaluate_red_line(rl, allocation, value_shares, legal_percent, me)
        if result is None and custom_red_lines is not None and i in custom_red_lines:
            result = custom_red_lines[i]
        if result is not None:
            evaluated.append(result)
    if not evaluated:
        return ScorecardPart(key="red_lines", label="红线", score=0, max=20, applicable=False), False
    kept = sum(1 for x in evaluated if x)
    broken = any(not x for x in evaluated)
    return ScorecardPart(
        key="red_lines", label="红线",
        score=round(20 * kept / len(evaluated), 1), max=20,
        detail=f"守住 {kept}/{len(evaluated)}",
    ), broken


def build_scorecard(goals: Goals, verdict: dict, me: str,
                    soft_scores: dict[str, float] | None = None,
                    custom_red_lines: dict[int, bool] | None = None) -> Scorecard:
    allocation = verdict.get("allocation") or {}
    vs = verdict.get("value_shares") or {}
    legal = verdict.get("legal_percent") or {}
    targets = verdict.get("targets") or {}
    p_assets = score_target_assets(goals, allocation, me)
    p_share = score_min_share(goals, vs, me)
    p_red, broken = score_red_lines(goals, allocation, vs, legal, me, custom_red_lines)
    if soft_scores:
        mean = sum(soft_scores.values()) / max(len(soft_scores), 1)
        p_soft = ScorecardPart(key="soft_goals", label="软目标", score=round(10 * mean, 1), max=10)
    else:
        p_soft = ScorecardPart(key="soft_goals", label="软目标", score=0, max=10, applicable=False)
    parts = [p_assets, p_share, p_red, p_soft]
    applicable = [p for p in parts if p.applicable]
    got = sum(p.score for p in applicable)
    ceiling = sum(p.max for p in applicable) or 1
    total = got / ceiling * 100
    capped = False
    if broken:
        total = min(total, 40)
        capped = True
    return Scorecard(
        member_id=me,
        parts=parts,
        total=round(total, 1),
        capped=capped,
        formula=FORMULA,
        value_share=float(vs.get(me, 0) or 0),
        nominal_pct=float(targets.get(me, 0) or 0),
        legal_pct=float(legal.get(me, 0) or 0),
    )
