"""博弈表 a/b/c/d：联盟、不可分资产竞争、玩家收益、稳定组合。不修改传入对象。"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product

from ..agents.allocator import allocate, default_preferences, member_value, settle_compensations, value_shares
from ..models import (
    AssetCompetitionRow,
    CaseInput,
    CoalitionRow,
    EquilibriumRow,
    GameTables,
    Goals,
    LegalResult,
    PayoffRow,
)

_TOL = 0.05
_MAX_CHOOSERS = 6
_MAX_OPTIONS = 3
_MAX_STABLE = 5

_NON_SEAT = {"pet", "ai_twin"}


def _pct(legal: LegalResult, member_id: str) -> float:
    sh = next((s for s in legal.shares if s.member_id == member_id), None)
    return sh.percent if sh else 0.0


def _alive_humans(case: CaseInput) -> list[str]:
    return [m.id for m in case.members if m.relation not in _NON_SEAT and not m.deceased]


def coalition_table(case: CaseInput, legal: LegalResult, goals: dict[str, Goals]) -> list[CoalitionRow]:
    heirs = [s.member_id for s in legal.shares if s.percent > 0]
    humans = set(_alive_humans(case))
    neglect = {m.id for m in case.members if m.neglect}
    rows: list[CoalitionRow] = []
    for mid in heirs:
        mine = set(goals.get(mid, Goals()).target_assets)
        confirmers: list[str] = []
        exposure: list[str] = []
        for other in humans:
            if other == mid:
                continue
            theirs = set(goals.get(other, Goals()).target_assets)
            if not (mine & theirs):
                confirmers.append(other)
            if (mine & theirs) or mid in neglect:
                exposure.append(other)
        rows.append(CoalitionRow(
            member_id=mid,
            potential_confirmers=confirmers,
            gain_pct=2.0,
            exposure_from=exposure,
        ))
    return rows


def asset_competition(case: CaseInput, legal: LegalResult, goals: dict[str, Goals]) -> list[AssetCompetitionRow]:
    prefs = default_preferences(case.members, case.assets)
    estate = max(legal.estate_total, 0.0001)
    rows: list[AssetCompetitionRow] = []
    for asset in case.assets:
        if asset.divisible:
            continue
        competitors: list[str] = []
        for mid, g in goals.items():
            if asset.id in g.target_assets:
                competitors.append(mid)
        for mid, row in prefs.items():
            if row.get(asset.id, 0) >= 0.9 and mid not in competitors:
                competitors.append(mid)
        can_absorb: dict[str, bool] = {}
        pref_score: dict[str, float] = {}
        for mid in competitors:
            legal_value = _pct(legal, mid) / 100 * estate
            can_absorb[mid] = legal_value >= 0.35 * asset.value
            score = prefs.get(mid, {}).get(asset.id, 0.4)
            if asset.id in goals.get(mid, Goals()).target_assets:
                score += 0.5
            pref_score[mid] = round(score, 2)
        winner = None
        if competitors:
            portion = asset.value / 2 if asset.joint and legal.spouse_id else asset.value
            portion = max(portion, 0.0001)

            def score(mid: str) -> float:
                pref = pref_score.get(mid, 0.4)
                remaining = _pct(legal, mid) / 100 * estate
                cap = max(remaining, 0.0) / portion
                return pref * (0.35 + min(cap, 1.2))

            winner = max(competitors, key=score)
        legal_value_winner = _pct(legal, winner) / 100 * estate if winner else 0.0
        rows.append(AssetCompetitionRow(
            asset_id=asset.id,
            competitors=competitors,
            can_absorb=can_absorb,
            pref_score=pref_score,
            predicted_winner=winner,
            compensation_needed=round(max(0.0, asset.value - legal_value_winner), 1),
        ))
    return rows


def payoff_table(case: CaseInput, legal: LegalResult, goals: dict[str, Goals], player_id: str) -> list[PayoffRow]:
    player_goals = goals.get(player_id, Goals())
    targets_base = {s.member_id: s.percent for s in legal.shares if s.eligible and s.percent > 0}
    prefs0 = default_preferences(case.members, case.assets)
    options: list[tuple[str, str, list[str], bool]] = []
    for asset_id in player_goals.target_assets[:3]:
        asset = next((a for a in case.assets if a.id == asset_id), None)
        if asset is None:
            continue
        options.append((f"claim:{asset_id}", f"主张{asset.name} 100%", [asset_id], False))
        options.append((f"claim:{asset_id}:concede", f"主张{asset.name}并协商让步", [asset_id], True))
    options.append(("divisible_only", "只要可分财产", [], False))
    options.append(("divisible_only:concede", "只要可分财产并协商让步", [], True))
    options = options[:8]

    rows: list[PayoffRow] = []
    others = [mid for mid in targets_base if mid != player_id]
    for option, label, claimed, concede in options:
        prefs = {mid: dict(row) for mid, row in prefs0.items()}
        for asset_id in claimed:
            if player_id in prefs:
                prefs[player_id][asset_id] = 1.5
        targets = dict(targets_base)
        if concede and player_id in targets:
            cut = min(1.5, targets[player_id])
            targets[player_id] = round(targets[player_id] - cut, 2)
            if others:
                each = cut / len(others)
                for mid in others:
                    targets[mid] = round(targets.get(mid, 0) + each, 2)
        if not targets:
            rows.append(PayoffRow(
                option=option, label=label, my_value=0, my_value_share=0,
                assets_obtained=[], compensation_paid=0, compensation_received=0,
            ))
            continue
        alloc = allocate(case, legal, targets, prefs)
        comps = settle_compensations(case, legal, alloc, targets)
        vs = value_shares(case, legal, alloc, comps)
        mv = member_value(case, alloc, comps)
        obtained = [
            a.id for a in case.assets
            if alloc.get(a.id, {}).get(player_id, 0) >= 50
        ]
        paid = round(sum(float(c["amount"]) for c in comps if c["from"] == player_id), 1)
        received = round(sum(float(c["amount"]) for c in comps if c["to"] == player_id), 1)
        rows.append(PayoffRow(
            option=option,
            label=label,
            my_value=round(mv.get(player_id, 0.0), 1),
            my_value_share=round(vs.get(player_id, 0.0), 1),
            assets_obtained=obtained,
            compensation_paid=paid,
            compensation_received=received,
        ))
    return rows


@dataclass(frozen=True)
class Option:
    key: str
    label: str
    claimed: tuple[str, ...]


DIVISIBLE_ONLY = Option("divisible_only", "只要可分财产", ())


def options_for(member_id: str, goals: dict[str, Goals], case: CaseInput) -> list[Option]:
    mine = goals.get(member_id, Goals())
    options: list[Option] = []
    for asset_id in mine.target_assets[:2]:
        asset = next((a for a in case.assets if a.id == asset_id), None)
        if asset is None:
            continue
        options.append(Option(f"claim:{asset_id}", f"主张{asset.name} 100%", (asset_id,)))
    options.append(DIVISIBLE_ONLY)
    return options[:_MAX_OPTIONS]


def _option_by_label(member_id: str, label: str, goals: dict[str, Goals], case: CaseInput) -> Option:
    for option in options_for(member_id, goals, case):
        if option.label == label:
            return option
    return DIVISIBLE_ONLY


def _heirs(legal: LegalResult) -> list[str]:
    return [s.member_id for s in legal.shares if s.percent > 0]


def _eval_options(
    case: CaseInput,
    legal: LegalResult,
    assignment: dict[str, Option],
) -> tuple[dict[str, float], dict[str, float]]:
    prefs0 = default_preferences(case.members, case.assets)
    prefs = {mid: dict(row) for mid, row in prefs0.items()}
    for mid, option in assignment.items():
        row = prefs.setdefault(mid, {})
        for asset_id in option.claimed:
            row[asset_id] = 1.5
    targets = {s.member_id: s.percent for s in legal.shares if s.eligible and s.percent > 0}
    if not targets:
        zeros = {mid: 0.0 for mid in assignment}
        return zeros, zeros
    alloc = allocate(case, legal, targets, prefs)
    comps = settle_compensations(case, legal, alloc, targets)
    return member_value(case, alloc, comps), value_shares(case, legal, alloc, comps)


def payoffs_for_profile(
    case: CaseInput,
    legal: LegalResult,
    profile: dict[str, str],
    goals: dict[str, Goals],
) -> tuple[dict[str, float], dict[str, float]]:
    assignment = {mid: _option_by_label(mid, label, goals, case) for mid, label in profile.items()}
    return _eval_options(case, legal, assignment)


def enumerate_profiles(
    case: CaseInput,
    legal: LegalResult,
    goals: dict[str, Goals],
) -> tuple[list[str], list[str], dict[str, list[Option]], str]:
    heirs = sorted(_heirs(legal), key=lambda mid: -_pct(legal, mid))
    note = ""
    if len(heirs) > _MAX_CHOOSERS:
        choosers, frozen = heirs[:_MAX_CHOOSERS], heirs[_MAX_CHOOSERS:]
        note = "成员超过 6 人，只对法定份额前 6 名穷举，其余固定为「只要可分财产」。"
    else:
        choosers, frozen = heirs, []
    choices = {mid: options_for(mid, goals, case) or [DIVISIBLE_ONLY] for mid in choosers}
    return choosers, frozen, choices, note


def _deviation_note(
    case: CaseInput,
    legal: LegalResult,
    assignment: dict[str, Option],
    payoffs: dict[str, float],
    choosers: list[str],
    choices: dict[str, list[Option]],
    cache: dict[tuple[tuple[str, str], ...], tuple[dict[str, float], dict[str, float]]],
) -> str | None:
    names = {m.id: m.name for m in case.members}
    for mid in choosers:
        current = assignment[mid]
        for alt in choices[mid]:
            if alt.key == current.key:
                continue
            trial = dict(assignment)
            trial[mid] = alt
            key = _cache_key(trial)
            if key not in cache:
                cache[key] = _eval_options(case, legal, trial)
            alt_pay, _ = cache[key]
            gain = alt_pay.get(mid, 0.0) - payoffs.get(mid, 0.0)
            if gain > _TOL:
                return f"{names.get(mid, mid)} 若改选「{alt.label}」可多拿约 {gain:.1f} 万"
    return None


def _cache_key(assignment: dict[str, Option]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((mid, opt.key) for mid, opt in assignment.items()))


def build_equilibrium(
    case: CaseInput,
    legal: LegalResult,
    goals: dict[str, Goals],
    player_id: str,
) -> list[EquilibriumRow]:
    choosers, frozen, choices, trunc_note = enumerate_profiles(case, legal, goals)
    if not choosers and not frozen:
        return []
    cache: dict[tuple[tuple[str, str], ...], tuple[dict[str, float], dict[str, float]]] = {}
    chooser_lists = [choices[mid] for mid in choosers]
    rows: list[tuple[EquilibriumRow, bool]] = []
    for combo in product(*chooser_lists) if chooser_lists else [()]:
        assignment = {mid: opt for mid, opt in zip(choosers, combo)}
        for mid in frozen:
            assignment[mid] = DIVISIBLE_ONLY
        key = _cache_key(assignment)
        if key not in cache:
            cache[key] = _eval_options(case, legal, assignment)
        payoffs, shares = cache[key]
        profile = {mid: opt.label for mid, opt in assignment.items()}
        note = _deviation_note(case, legal, assignment, payoffs, choosers, choices, cache)
        stable = note is None
        row_note = trunc_note
        rows.append((
            EquilibriumRow(
                profile=profile,
                payoffs={mid: round(payoffs.get(mid, 0.0), 1) for mid in assignment},
                my_value=round(payoffs.get(player_id, 0.0), 1),
                my_value_share=round(shares.get(player_id, 0.0), 1),
                stable=stable,
                note=row_note,
            ),
            stable,
        ))
    stables = [row for row, ok in rows if ok]
    stables.sort(key=lambda r: r.my_value, reverse=True)
    if stables:
        return stables[:_MAX_STABLE]
    best = max((row for row, _ in rows), key=lambda r: r.my_value, default=None)
    if best is None:
        return []
    assignment = {mid: _option_by_label(mid, label, goals, case) for mid, label in best.profile.items()}
    payoffs, _ = payoffs_for_profile(case, legal, best.profile, goals)
    why = _deviation_note(case, legal, assignment, payoffs, choosers, choices, cache) or "有人会单方面改主意"
    note = f"不存在所有人都满意的稳定组合：{why}"
    if trunc_note:
        note = f"{trunc_note}{note}"
    return [best.model_copy(update={"stable": False, "note": note})]


def build_game_tables(case: CaseInput, legal: LegalResult, goals: dict[str, Goals], player_id: str) -> GameTables:
    return GameTables(
        coalition=coalition_table(case, legal, goals),
        asset_competition=asset_competition(case, legal, goals),
        payoff=payoff_table(case, legal, goals, player_id),
        equilibrium=build_equilibrium(case, legal, goals, player_id),
    )
