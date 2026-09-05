"""入局推演 Markdown 报告。export_markdown 只调用 render_seat_report。"""
from __future__ import annotations

from typing import Any

from ..models import (
    Brief,
    BriefItem,
    CaseInput,
    EquilibriumRow,
    GameTables,
    Goals,
    RedLine,
    Scorecard,
    SoftGoal,
    StrategyPack,
)

BRIEF_SECTIONS: list[tuple[str, str]] = [
    ("baseline", "① 法定基线与法条"),
    ("reachable", "② 可达区间"),
    ("levers", "③ 杠杆清单"),
    ("asset_strategy", "④ 资产策略"),
    ("playbook", "⑤ 谈判剧本"),
    ("opponents", "⑥ 对手预判与应对"),
    ("risks", "⑦ 风险提示"),
]

THREAT = {"high": "高", "medium": "中", "low": "低", "none": "—"}
CONFIDENCE = {"high": "高", "medium": "中", "low": "低", "abstain": "弃权"}


def _name(case: CaseInput, member_id: str) -> str:
    return next((m.name for m in case.members if m.id == member_id), member_id)


def _asset(case: CaseInput, asset_id: str) -> str:
    asset = next((a for a in case.assets if a.id == asset_id), None)
    if asset is None:
        return asset_id
    return f"{asset.emoji}{asset.name}"


def _asset_plain(case: CaseInput, asset_id: str) -> str:
    return next((a.name for a in case.assets if a.id == asset_id), asset_id)


def red_line_text(item: RedLine, case: CaseInput) -> str:
    asset = _asset_plain(case, item.asset_id) if item.asset_id else "该资产"
    member = _name(case, item.member_id) if item.member_id else "该成员"
    if item.kind == "no_sell_asset":
        return f"不接受出售{asset}"
    if item.kind == "no_member_gets_asset":
        return f"不接受 {member} 取得 {asset}"
    if item.kind == "not_below_legal":
        return "不接受低于法定份额"
    if item.kind == "no_co_own_asset":
        return f"不接受与 {member} 共有 {asset}"
    return item.text.strip() or "自定义红线"


def soft_goal_text(item: SoftGoal, case: CaseInput) -> str:
    member = _name(case, item.member_id) if item.member_id else "该成员"
    asset = _asset_plain(case, item.asset_id) if item.asset_id else "该资产"
    if item.kind == "keep_relation":
        return f"与 {member} 关系不破裂"
    if item.kind == "pet_custody":
        return f"取得{asset}的照护权"
    if item.kind == "keep_residence":
        return f"继续居住于{asset}"
    if item.kind == "recognition":
        return "付出被当庭承认"
    return item.text.strip() or "自定义软目标"


def _md_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    def fmt(cells: list[str]) -> str:
        return "| " + " | ".join(cells) + " |"
    lines = [fmt(headers), "| " + " | ".join("---" for _ in headers) + " |"]
    lines.extend(fmt(row) for row in rows)
    return lines


def _item_note(item: BriefItem) -> str:
    bits: list[str] = []
    if item.article:
        bits.append(f"第{item.article}条")
    if item.delta_pct is not None:
        bits.append(f"Δ{item.delta_pct:+.1f}%")
    if item.confidence:
        bits.append(CONFIDENCE.get(item.confidence, item.confidence))
    if not bits:
        return item.text
    return f"{item.text}（{' / '.join(bits)}）"


def _enabled(items: list[BriefItem]) -> list[BriefItem]:
    return [item for item in items if item.enabled]


def _goals_lines(goals: Goals, case: CaseInput) -> list[str]:
    lines: list[str] = []
    if goals.target_assets:
        ordered = " → ".join(_asset(case, aid) for aid in goals.target_assets)
        lines.append(f"- 目标资产（有序）：{ordered}")
    else:
        lines.append("- 目标资产：未设定")
    if goals.min_value_share is None:
        lines.append("- 最低价值份额：未设定")
    else:
        lines.append(f"- 最低价值份额：{goals.min_value_share:g}%")
    if goals.red_lines:
        lines.append("- 红线：")
        lines.extend(f"  - {red_line_text(item, case)}" for item in goals.red_lines)
    else:
        lines.append("- 红线：未设定")
    if goals.soft_goals:
        lines.append("- 软目标：")
        lines.extend(f"  - {soft_goal_text(item, case)}" for item in goals.soft_goals)
    else:
        lines.append("- 软目标：未设定")
    if goals.narrative.strip():
        lines.append(f"- 自由文本：{goals.narrative.strip()}")
    return lines


def _brief_lines(brief: Brief) -> list[str]:
    lines: list[str] = []
    for attr, title in BRIEF_SECTIONS:
        items = _enabled(getattr(brief, attr))
        if not items:
            continue
        lines.append(f"- **{title}**")
        lines.extend(f"  - {_item_note(item)}" for item in items)
    if not lines:
        lines.append("- （简报条目均未启用）")
    return lines


def _matrix_table(strategy: StrategyPack, scorecards: dict[str, Any], case: CaseInput) -> list[str]:
    headers = ["成员", "法定基线", "可达区间", "目标资产", "与我的冲突", "潜在同盟", "策略要点", "威胁", "实际达成度"]
    rows: list[list[str]] = []
    for row in strategy.matrix:
        reach = "—"
        if row.no_legal_share_reason:
            reach = row.no_legal_share_reason
        elif row.reachable:
            reach = f"{row.reachable.low:g}–{row.reachable.high:g}%"
        card = scorecards.get(row.member_id) or (row.achieved.model_dump() if row.achieved else None)
        achieved = "—"
        if isinstance(card, Scorecard):
            achieved = f"{card.total:g}"
        elif isinstance(card, dict) and card.get("total") is not None:
            achieved = f"{card['total']}"
        rows.append([
            _name(case, row.member_id),
            f"{row.baseline_pct:g}%",
            reach,
            " ".join(_asset(case, aid) for aid in row.target_assets) or "—",
            " ".join(_asset(case, aid) for aid in row.conflicts_with_player) or "—",
            "、".join(_name(case, mid) for mid in row.potential_allies) or "—",
            row.strategy_summary or "—",
            THREAT.get(row.threat_level, row.threat_level),
            achieved,
        ])
    return _md_table(headers, rows)


def _opponent_notes(strategy: StrategyPack, case: CaseInput) -> list[str]:
    lines: list[str] = []
    player = strategy.player_id
    goals_map = case.seat.goals if case.seat else {}
    for row in strategy.matrix:
        if row.member_id == player:
            continue
        lines += ["", f"**{_name(case, row.member_id)}**"]
        goals = goals_map.get(row.member_id)
        if goals:
            lines.extend(_goals_lines(goals, case))
        else:
            lines.append("- 推断诉求：未写入")
        brief = strategy.briefs.get(row.member_id)
        if brief is None:
            lines.append("- 简报摘要：无")
            continue
        snippets: list[str] = []
        for attr in ("levers", "playbook"):
            snippets.extend(_item_note(item) for item in _enabled(getattr(brief, attr))[:3])
        if snippets:
            lines.append("- 简报摘要（③⑤）：")
            lines.extend(f"  - {text}" for text in snippets[:3])
        else:
            lines.append("- 简报摘要：无启用条目")
    return lines


def _game_tables(game: GameTables, case: CaseInput) -> list[str]:
    lines: list[str] = []
    if game.coalition:
        lines += ["", "联盟表", ""]
        lines += _md_table(
            ["成员", "可能确认扶养", "增益", "暴露来源"],
            [
                [
                    _name(case, row.member_id),
                    "、".join(_name(case, mid) for mid in row.potential_confirmers) or "—",
                    f"+{row.gain_pct:g}%",
                    "、".join(_name(case, mid) for mid in row.exposure_from) or "—",
                ]
                for row in game.coalition
            ],
        )
    if game.asset_competition:
        lines += ["", "资产竞争表", ""]
        lines += _md_table(
            ["资产", "竞争者", "预测归属", "需补偿"],
            [
                [
                    _asset(case, row.asset_id),
                    "、".join(_name(case, mid) for mid in row.competitors) or "—",
                    _name(case, row.predicted_winner) if row.predicted_winner else "—",
                    f"{row.compensation_needed:g} 万",
                ]
                for row in game.asset_competition
            ],
        )
    if game.payoff:
        lines += ["", "我的收益表", ""]
        lines += _md_table(
            ["选项", "到手价值", "价值份额", "拿到的资产", "补偿"],
            [
                [
                    row.label,
                    f"{row.my_value:g} 万",
                    f"{row.my_value_share:g}%",
                    " ".join(_asset(case, aid) for aid in row.assets_obtained) or "—",
                    f"付 {row.compensation_paid:g} / 收 {row.compensation_received:g}",
                ]
                for row in game.payoff
            ],
        )
    if game.equilibrium:
        lines += ["", "预计均衡结局", ""]
        headers = ["组合", "我的收益", "价值份额", "是否稳定", "说明"]
        rows = []
        for row in game.equilibrium:
            combo = "；".join(f"{_name(case, mid)}：{label}" for mid, label in row.profile.items())
            rows.append([
                combo,
                f"{row.my_value:g} 万",
                f"{row.my_value_share:g}%",
                "稳定" if row.stable else "不稳定",
                row.note or "—",
            ])
        lines += _md_table(headers, rows)
    return lines


def _scorecard_lines(debrief: dict[str, Any], case: CaseInput, player_id: str) -> list[str]:
    raw = (debrief.get("scorecards") or {}).get(player_id)
    lines: list[str] = []
    if raw:
        card = Scorecard.model_validate(raw) if not isinstance(raw, Scorecard) else raw
        lines.append(f"- 总分：{card.total:g}" + ("（红线被破，上限 40）" if card.capped else ""))
        lines.append(f"- 公式：{card.formula}")
        for part in card.parts:
            if not part.applicable:
                lines.append(f"- {part.label}：未设定")
                continue
            detail = f"（{part.detail}）" if part.detail else ""
            lines.append(f"- {part.label}：{part.score:g}/{part.max:g}{detail}")
    else:
        lines.append("- 记分卡尚未生成")
    lines += ["", "全员达成", ""]
    headers = ["成员", "达成度", "价值份额", "名义份额", "法定基线"]
    rows: list[list[str]] = []
    for mid, payload in (debrief.get("scorecards") or {}).items():
        card = Scorecard.model_validate(payload) if not isinstance(payload, Scorecard) else payload
        rows.append([
            _name(case, mid),
            f"{card.total:g}",
            f"{card.value_share:g}%",
            f"{card.nominal_pct:g}%",
            f"{card.legal_pct:g}%",
        ])
    if rows:
        lines += _md_table(headers, rows)
    else:
        lines.append("暂无全员记分卡。")
    return lines


def render_seat_report(session: Any) -> list[str]:
    case: CaseInput = session.case
    seat = case.seat
    if seat is None:
        return []
    player_id = seat.player_id
    player_name = _name(case, player_id)
    strategy = seat.strategy
    debrief = getattr(getattr(session, "seat", None), "debrief", None) or {}
    player_turns = [t for t in session.transcript if t.agent_id == player_id]
    human_n = sum(1 for t in player_turns if (t.meta or {}).get("by") == "human")
    ai_n = len(player_turns) - human_n
    advisor = "未接入"
    if strategy and strategy.generated_by:
        advisor = strategy.generated_by
    elif seat.advisor_model and not seat.advisor_model.is_mock:
        advisor = f"{seat.advisor_model.provider_id} · {seat.advisor_model.model}".strip(" ·")
    lines = [
        "## 入局推演报告",
        "",
        f"- 玩家：{player_name}",
        f"- 席位模式：AI 代理 {ai_n} 回合 / 亲自发言 {human_n} 回合",
        f"- 军师：{advisor}",
        "",
        "### 我的诉求",
        "",
    ]
    mine = seat.goals.get(player_id)
    if mine:
        lines += _goals_lines(mine, case)
    else:
        lines.append("- 未填写诉求")
    lines += ["", "### 我的策略简报", ""]
    if strategy is None:
        lines.append("开庭前未推演策略")
    else:
        brief = strategy.briefs.get(player_id)
        if brief:
            lines += _brief_lines(brief)
        else:
            lines.append("开庭前未推演策略")
    lines += ["", "### 全员策略矩阵", ""]
    scorecards = debrief.get("scorecards") or {}
    if strategy:
        lines += _matrix_table(strategy, scorecards, case)
        lines += _opponent_notes(strategy, case)
    else:
        lines.append("开庭前未推演策略")
    lines += ["", "### 博弈分析", ""]
    game = strategy.game if strategy else None
    if game:
        extra = _game_tables(game, case)
        lines += extra or ["（无博弈表）"]
    else:
        lines.append("开庭前未推演策略")
    lines += ["", "### what-if 对照与举证清单", ""]
    recap = debrief.get("whatif_recap") or (strategy.whatif if strategy else [])
    if recap:
        for item in recap:
            data = item if isinstance(item, dict) else item.model_dump()
            evidence = "、".join(data.get("evidence") or []) or "—"
            lines.append(
                f"- {data.get('label', data.get('key', ''))}：Δ{data.get('delta_pct', 0):+.1f}%　"
                f"第{data.get('article', '')}条　证据：{evidence}"
            )
    else:
        lines.append("- 无 what-if 差分")
    lines += ["", "### 记分卡", ""]
    if debrief:
        lines += _scorecard_lines(debrief, case, player_id)
    else:
        lines.append("- 庭审尚未复盘")
    lines += ["", "### 复盘与下一局建议", ""]
    narrative = debrief.get("narrative") if debrief else None
    next_time = debrief.get("next_time") if debrief else []
    if narrative:
        lines += [narrative, ""]
    else:
        lines.append("未接入军师模型，未生成叙事复盘")
    if next_time:
        lines.append("")
        lines.extend(f"- {item}" for item in next_time)
    return lines
