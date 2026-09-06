"""可达区间、what-if 差分、对手诉求推断与确定性分析组装。不修改传入的 case。"""
from __future__ import annotations

from dataclasses import dataclass

from ..agents.allocator import allocate, default_preferences, settle_compensations, value_shares
from ..agents.personas import default_wish
from ..legal import compute_legal_shares, hint_for, hints_for_member
from ..models import (
    CaseInput,
    GameTables,
    Goals,
    LegalResult,
    MatrixRow,
    Member,
    Reachability,
    RedLine,
    SeatAnalysis,
    SeatConfig,
    SoftGoal,
    WhatIfDelta,
)

_PLAYER_BONUS = ("main_support", "cohabit", "hardship")
_OTHER_BONUS = ("main_support", "cohabit", "hardship")
_NON_SEAT = {"pet", "ai_twin"}


@dataclass(frozen=True)
class Toggle:
    key: str
    subject_id: str
    kind: str
    current_value: bool


def _member(case: CaseInput, member_id: str) -> Member:
    return next(m for m in case.members if m.id == member_id)


def _share_of(legal: LegalResult, member_id: str) -> float:
    sh = next((s for s in legal.shares if s.member_id == member_id), None)
    return sh.percent if sh else 0.0


def _share_row(legal: LegalResult, member_id: str):
    return next((s for s in legal.shares if s.member_id == member_id), None)


def _alive_humans(case: CaseInput) -> list[Member]:
    return [m for m in case.members if m.relation not in _NON_SEAT and not m.deceased]


def apply_toggle(case: CaseInput, key: str) -> CaseInput:
    cloned = case.model_copy(deep=True)
    kind, subject = key.split(":", 1)
    if kind == "joint":
        for asset in cloned.assets:
            if asset.id == subject:
                asset.joint = not asset.joint
                break
    else:
        for member in cloned.members:
            if member.id == subject:
                setattr(member, kind, not getattr(member, kind))
                break
    return cloned


def apply_keys(case: CaseInput, keys: list[str]) -> CaseInput:
    out = case
    for key in keys:
        out = apply_toggle(out, key)
    return out


def toggleable_facts(case: CaseInput, player_id: str) -> list[Toggle]:
    player = _member(case, player_id)
    toggles: list[Toggle] = []

    def add_flag(member: Member, kind: str) -> None:
        current = bool(getattr(member, kind))
        if current:
            return
        toggles.append(Toggle(f"{kind}:{member.id}", member.id, kind, current))

    for kind in _PLAYER_BONUS:
        add_flag(player, kind)
    if player.relation == "stepchild":
        add_flag(player, "dependency")
    add_flag(player, "neglect")

    for other in _alive_humans(case):
        if other.id == player_id:
            continue
        add_flag(other, "neglect")
        for kind in _OTHER_BONUS:
            add_flag(other, kind)

    for asset in case.assets:
        toggles.append(Toggle(f"joint:{asset.id}", asset.id, "joint", asset.joint))
    return toggles


def _label_for(case: CaseInput, toggle: Toggle) -> str:
    if toggle.kind == "joint":
        asset = next(a for a in case.assets if a.id == toggle.subject_id)
        if toggle.current_value:
            return f"主张 {asset.name} 为个人财产"
        return f"主张 {asset.name} 为夫妻共同财产"
    member = _member(case, toggle.subject_id)
    names = {
        "main_support": f"证明 {member.name} 尽了主要扶养义务",
        "cohabit": f"证明 {member.name} 与逝者共同生活",
        "hardship": f"证明 {member.name} 生活困难且缺乏劳动能力",
        "neglect": f"证明 {member.name} 有能力却未尽扶养义务",
        "dependency": f"证明 {member.name} 与逝者存在扶养关系",
    }
    return names.get(toggle.kind, f"切换 {member.name} 的 {toggle.kind}")


def _economic_pct(legal: LegalResult, member_id: str) -> float:
    return _share_of(legal, member_id) * legal.estate_total / max(legal.gross_total, 1e-9)


def whatif(case: CaseInput, player_id: str) -> list[WhatIfDelta]:
    baseline = compute_legal_shares(case)
    base_pct = _share_of(baseline, player_id)
    base_econ = _economic_pct(baseline, player_id)
    out: list[WhatIfDelta] = []
    for toggle in toggleable_facts(case, player_id):
        flipped = apply_toggle(case, toggle.key)
        after = compute_legal_shares(flipped)
        legal_delta = _share_of(after, player_id) - base_pct
        if abs(legal_delta) >= 0.05:
            delta = round(legal_delta, 2)
        else:
            # 1153 析产不改名义份额，但改变玩家对总额的经济份额
            delta = round(_economic_pct(after, player_id) - base_econ, 2)
        if abs(delta) < 0.05:
            continue
        lever = "joint" if toggle.kind == "joint" else toggle.kind
        hint = hint_for(lever)
        article = hint.article if hint else "1130"
        evidence = list(hint.evidence) if hint else ["书面证据", "证人证言", "视听资料"]
        out.append(WhatIfDelta(
            key=toggle.key,
            subject_id=toggle.subject_id,
            label=_label_for(case, toggle),
            article=article,
            delta_pct=delta,
            direction="favorable" if delta > 0 else "adverse",
            evidence=evidence,
        ))
    return out


def _mine_side(case: CaseInput, player_id: str, item: WhatIfDelta) -> bool:
    """我方可证明：自身加分、对方 neglect、对我有利的 joint。"""
    kind, subject = item.key.split(":", 1)
    if kind == "neglect":
        return subject != player_id
    if kind == "joint":
        return item.direction == "favorable"
    return subject == player_id


def _value_share(case: CaseInput, legal: LegalResult, player_id: str) -> float:
    share = _share_row(legal, player_id)
    if share is None or share.percent <= 0:
        return 0.0
    targets = {s.member_id: s.percent for s in legal.shares if s.eligible and s.percent > 0}
    if player_id not in targets:
        return 0.0
    prefs = default_preferences(case.members, case.assets)
    goals = case.seat.goals.get(player_id) if case.seat else None
    if goals:
        for asset_id in goals.target_assets:
            if player_id in prefs and asset_id in prefs[player_id]:
                prefs[player_id][asset_id] = 1.5
    alloc = allocate(case, legal, targets, prefs)
    comps = settle_compensations(case, legal, alloc, targets)
    return value_shares(case, legal, alloc, comps).get(player_id, 0.0)


def reachability(case: CaseInput, player_id: str) -> Reachability:
    legal = compute_legal_shares(case)
    legal_pct = _share_of(legal, player_id)
    deltas = whatif(case, player_id)
    favorable = [d.key for d in deltas if d.direction == "favorable" and _mine_side(case, player_id, d)]
    adverse = [
        d.key for d in deltas
        if d.direction == "adverse" and not _mine_side(case, player_id, d)
    ]
    high_case = apply_keys(case, favorable)
    low_case = apply_keys(case, adverse)
    high_legal = compute_legal_shares(high_case)
    low_legal = compute_legal_shares(low_case)
    high = _share_of(high_legal, player_id)
    low = _share_of(low_legal, player_id)
    if low > high:
        low, high = high, low
    low = min(low, legal_pct)
    high = max(high, legal_pct)
    value_high = _value_share(high_case, high_legal, player_id)
    value_low = _value_share(low_case, low_legal, player_id)
    if value_low > value_high:
        value_low, value_high = value_high, value_low
    return Reachability(
        legal_pct=legal_pct,
        low=round(low, 2),
        high=round(high, 2),
        value_low=round(value_low, 1),
        value_high=round(value_high, 1),
        favorable_keys=favorable,
        adverse_keys=adverse,
    )


def infer_goals(case: CaseInput, member_id: str, legal: LegalResult) -> Goals:
    member = _member(case, member_id)
    if member.relation in _NON_SEAT:
        return Goals()
    prefs = default_preferences(case.members, case.assets).get(member_id, {})
    max_value = max((a.value for a in case.assets), default=1) or 1
    ranked = sorted(
        case.assets,
        key=lambda a: prefs.get(a.id, 0.05) * (1 + a.value / max_value),
        reverse=True,
    )
    target_assets = [a.id for a in ranked[:3]]
    legal_pct = _share_of(legal, member_id)
    min_share = None
    if member.personality in {"greedy", "calculating", "lawyer"} and legal_pct > 0:
        min_share = float(round(legal_pct))

    red_lines: list[RedLine] = []
    sentimental = next((a for a in case.assets if a.sentimental), None)
    if member.personality in {"filial", "loyal"} and sentimental:
        red_lines.append(RedLine(kind="no_sell_asset", asset_id=sentimental.id))
    house = next((a for a in case.assets if a.type == "house"), None)
    if member.relation == "spouse" and house:
        if not any(r.kind == "no_sell_asset" and r.asset_id == house.id for r in red_lines):
            red_lines.append(RedLine(kind="no_sell_asset", asset_id=house.id))
    if member.personality in {"lawyer", "calculating"} and legal_pct > 0:
        red_lines.append(RedLine(kind="not_below_legal"))

    soft: list[SoftGoal] = []
    if member.relation == "spouse" and house:
        soft.append(SoftGoal(kind="keep_residence", asset_id=house.id))
    pet = next((a for a in case.assets if a.type == "pet"), None)
    if member.personality in {"filial", "loyal"} and pet:
        soft.append(SoftGoal(kind="pet_custody", asset_id=pet.id))
    if member.personality == "drama":
        soft.append(SoftGoal(kind="recognition"))
    if member.personality in {"chill", "filial"}:
        others = [
            s for s in legal.shares
            if s.member_id != member_id and s.percent > 0 and s.eligible
        ]
        if others:
            top = max(others, key=lambda s: s.percent)
            soft.append(SoftGoal(kind="keep_relation", member_id=top.member_id))

    top_assets = "、".join(a.name for a in sorted(case.assets, key=lambda a: -a.value)[:2]) or "遗产"
    narrative = member.wish.strip() or default_wish(member, top_assets)
    return Goals(
        target_assets=target_assets,
        min_value_share=min_share,
        red_lines=red_lines[:3],
        soft_goals=soft[:3],
        narrative=narrative,
        source="inferred",
    )


def infer_all_goals(case: CaseInput, legal: LegalResult, player_id: str) -> dict[str, Goals]:
    existing = case.seat.goals if case.seat else {}
    out: dict[str, Goals] = {}
    for member in _alive_humans(case):
        if member.id == player_id:
            continue
        held = existing.get(member.id)
        if held and held.source == "user":
            out[member.id] = held
        else:
            out[member.id] = infer_goals(case, member.id, legal)
    return out


def merged_goals(case: CaseInput, legal: LegalResult, player_id: str | None = None) -> dict[str, Goals]:
    pid = player_id or (case.seat.player_id if case.seat else None)
    existing = case.seat.goals if case.seat else {}
    out: dict[str, Goals] = {}
    for member in _alive_humans(case):
        held = existing.get(member.id)
        if held and held.source == "user":
            out[member.id] = held
            continue
        if pid and member.id == pid and held:
            out[member.id] = held
            continue
        out[member.id] = infer_goals(case, member.id, legal)
    return out


def _threat(player_goals: Goals | None, row_goals: Goals | None, member_id: str,
            absorb_by_asset: dict[str, dict[str, bool]], share: float, indivisible: set[str]) -> str:
    mine = set(player_goals.target_assets if player_goals else [])
    theirs = set(row_goals.target_assets if row_goals else [])
    overlap = mine & theirs
    if any(aid in indivisible and absorb_by_asset.get(aid, {}).get(member_id) for aid in overlap):
        return "high"
    if overlap:
        return "medium"
    if share > 0:
        return "low"
    return "none"


def analyze(case: CaseInput) -> SeatAnalysis:
    if case.seat is None:
        raise ValueError("缺少席位配置")
    player_id = case.seat.player_id
    legal = compute_legal_shares(case)
    player_reach = reachability(case, player_id)
    deltas = whatif(case, player_id)
    inferred = infer_all_goals(case, legal, player_id)
    all_goals = merged_goals(case, legal, player_id)
    from .game import build_game_tables

    game = build_game_tables(case, legal, all_goals, player_id)
    player = _member(case, player_id)
    checklist = [h.as_dict() for h in hints_for_member(player)]
    indivisible = {a.id for a in case.assets if not a.divisible}
    absorb_by_asset: dict[str, dict[str, bool]] = {
        row.asset_id: row.can_absorb for row in game.asset_competition
    }
    coalition = next((r for r in game.coalition if r.member_id == player_id), None)
    player_goals = all_goals.get(player_id)
    matrix: list[MatrixRow] = []
    for member in case.members:
        row_share = _share_row(legal, member.id)
        pct = row_share.percent if row_share else 0.0
        reason = None
        if row_share and (not row_share.eligible or pct <= 0) and row_share.notes:
            reason = row_share.notes[0]
        g = all_goals.get(member.id)
        conflicts = []
        if player_goals and g:
            conflicts = [aid for aid in g.target_assets if aid in player_goals.target_assets]
        allies = coalition.potential_confirmers if coalition and member.id == player_id else []
        if coalition and member.id != player_id and member.id in coalition.potential_confirmers:
            allies = [player_id]
        matrix.append(MatrixRow(
            member_id=member.id,
            baseline_pct=pct,
            reachable=reachability(case, member.id) if member.relation not in _NON_SEAT and not member.deceased else None,
            target_assets=list(g.target_assets) if g else [],
            conflicts_with_player=conflicts,
            potential_allies=allies,
            strategy_summary="",
            threat_level=_threat(player_goals, g, member.id, absorb_by_asset, pct, indivisible),
            no_legal_share_reason=reason,
        ))

    warnings: list[str] = []
    pg = case.seat.goals.get(player_id) or player_goals
    if pg and pg.min_value_share is not None and pg.min_value_share > player_reach.high:
        warnings.append(
            f"即使证明全部有利事实也只到 {player_reach.high:.1f}%，"
            f"{pg.min_value_share:.0f}% 不现实"
        )
    player_row = _share_row(legal, player_id)
    if player_row and (not player_row.eligible or player_row.percent <= 0):
        why = player_row.notes[0] if player_row.notes else "无法定份额"
        warnings.append(f"你不是法定继承人：{why}")

    return SeatAnalysis(
        player_id=player_id,
        legal=legal.model_dump(),
        reachability=player_reach,
        whatif=deltas,
        evidence_checklist=checklist,
        inferred_goals=inferred,
        game=game,
        matrix=matrix,
        warnings=warnings,
    )


# 避免循环导入时的类型检查噪音
_ = (SeatConfig, GameTables)
