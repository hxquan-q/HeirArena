"""军师：模型解析、JSON 抽取修复、简报 / 矩阵生成、策略组装。"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Annotated, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..agents.llm import LLMClient, LLMError, ModelUnavailable, extract_json, repair_messages, resolve_client
from ..config import Settings
from ..legal import ARTICLES, hint_for
from ..models import (
    Brief,
    BriefItem,
    CaseInput,
    Goals,
    MatrixRow,
    SeatAnalysis,
    StrategyPack,
    ThreatLevel,
)
from .analysis import analyze, merged_goals
from .prompts import (
    SAFETY_PREAMBLE,
    brief_messages,
    cards_messages,
    debrief_messages,
    matrix_messages,
    meta_messages,
)

T = TypeVar("T", bound=BaseModel)
CompleteFn = Callable[[LLMClient, list[dict[str, str]]], Awaitable[str]]

_SKIP = {"pet", "ai_twin"}


class AdvisorUnavailable(LLMError):
    """军师输出无法通过校验，或模型槽位不可用。"""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MatrixRowOut(_Strict):
    member_id: str
    strategy_summary: str = Field(max_length=80)
    threat_level: ThreatLevel
    rationale: str = Field(max_length=120)


class MatrixSummaryOut(_Strict):
    rows: list[MatrixRowOut]


class BriefItemOut(_Strict):
    text: str = Field(max_length=160)
    depends_on: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    article: str | None = None
    delta_pct: float | None = None
    confidence: str | None = None


class BriefOut(_Strict):
    baseline: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    reachable: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    levers: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    asset_strategy: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    playbook: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    opponents: list[BriefItemOut] = Field(default_factory=list, max_length=6)
    risks: list[BriefItemOut] = Field(default_factory=list, max_length=6)


class CardOut(_Strict):
    title: str = Field(max_length=20)
    text: str = Field(max_length=180)
    responds_to: str | None = None
    action: Literal["attack", "ally", "propose", "concede", "plead"] = "propose"
    claims: dict[str, float] = Field(default_factory=dict)
    suggests_admission: str | None = None
    serves: str = ""
    risk_note: str = ""


class CardsOut(_Strict):
    cards: list[CardOut] = Field(min_length=2, max_length=3)


class MetaOut(_Strict):
    action: str
    target: str | None = None
    claims: dict[str, float] = Field(default_factory=dict)


SoftScore = Annotated[float, Field(ge=0, le=1)]


class DebriefRationaleOut(_Strict):
    kind: Literal["soft_goal", "custom_red_line"]
    index: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=160)
    turn_ids: list[str] = Field(default_factory=list, max_length=8)


class DebriefOut(_Strict):
    soft_scores: dict[str, dict[str, SoftScore]]
    custom_red_lines: dict[str, dict[str, bool]]
    narrative: str = Field(max_length=600)
    next_time: list[str] = Field(default_factory=list, max_length=5)
    rationales: dict[str, list[DebriefRationaleOut]] = Field(default_factory=dict)


def _advisor_timeout(settings: Settings) -> float:
    return min(max(settings.timeout, 60), 180)


def resolve_advisor(case: CaseInput, settings: Settings, providers) -> tuple[LLMClient, str] | None:
    ref = None
    if case.seat and case.seat.advisor_model is not None:
        ref = case.seat.advisor_model
    elif case.executor_model is not None:
        ref = case.executor_model
    elif case.default_model is not None:
        ref = case.default_model
    if ref is not None and ref.is_mock:
        return None
    if providers is None:
        return None
    try:
        return resolve_client(
            ref,
            settings,
            providers,
            temperature=0.3,
            timeout=_advisor_timeout(settings),
            purpose="军师",
        )
    except ModelUnavailable:
        return None


async def _default_complete(client: LLMClient, messages: list[dict[str, str]], max_tokens: int) -> str:
    try:
        return await client.complete(messages, json_mode=True, temperature=0.3, max_tokens=max_tokens)
    except LLMError as error:
        if "response_format" not in str(error) and "HTTP 400" not in str(error):
            raise
        return await client.complete(messages, json_mode=False, temperature=0.3, max_tokens=max_tokens)


async def complete_schema(
    client: LLMClient,
    messages: list[dict[str, str]],
    model_cls: type[T],
    *,
    max_tokens: int = 4000,
    complete: CompleteFn | None = None,
) -> T:
    async def run(msgs: list[dict[str, str]]) -> str:
        if complete is not None:
            return await complete(client, msgs)
        return await _default_complete(client, msgs, max_tokens)

    raw = await run(messages)
    data = extract_json(raw)
    if data is not None:
        try:
            return model_cls.model_validate(data)
        except ValidationError as error:
            validation_error = str(error)
    else:
        validation_error = "模型没有返回 JSON 对象"

    repaired_raw = await run(repair_messages(messages, raw, validation_error))
    repaired = extract_json(repaired_raw)
    if repaired is None:
        raise AdvisorUnavailable("军师连续两次没有返回合法 JSON")
    try:
        return model_cls.model_validate(repaired)
    except ValidationError as error:
        raise AdvisorUnavailable(f"军师输出仍不符合结构：{error.errors()[0]['msg']}") from error


def _item(section: str, index: int, text: str, **kw) -> BriefItem:
    return BriefItem(id=f"{section}-{index}", text=text[:160], enabled=True, **kw)


def _playable_ids(case: CaseInput) -> list[str]:
    return [m.id for m in case.members if m.relation not in _SKIP and not m.deceased]


def _share_row(analysis: SeatAnalysis, member_id: str) -> dict | None:
    return next((s for s in analysis.legal.get("shares", []) if s.get("member_id") == member_id), None)


def rules_brief(analysis: SeatAnalysis, member_id: str) -> Brief:
    share = _share_row(analysis, member_id)
    name = (share or {}).get("name") or member_id
    pct = float((share or {}).get("percent") or 0)
    basis = "、".join((share or {}).get("basis") or []) or "1127"
    notes = "；".join((share or {}).get("notes") or []) or "按法定继承处理"
    row = next((r for r in analysis.matrix if r.member_id == member_id), None)
    reach = row.reachable if row and row.reachable else analysis.reachability
    baseline = [
        _item("baseline", 0, f"{name} 法定参考份额 {pct:.1f}%（第{basis}条）", article=basis.split("、")[0] if basis else None),
        _item("baseline", 1, notes[:160], article="1130" if "1130" in basis else None),
    ]
    reachable = [
        _item(
            "reachable",
            0,
            f"名义份额可达区间 {reach.low:.1f}%–{reach.high:.1f}%，当前 {reach.legal_pct:.1f}%",
        )
    ]
    if reach.value_low is not None and reach.value_high is not None:
        reachable.append(
            _item(
                "reachable",
                1,
                f"价值份额大约 {reach.value_low:.1f}%–{reach.value_high:.1f}%（含折价补偿）",
            )
        )
    levers: list[BriefItem] = []
    source = analysis.whatif if member_id == analysis.player_id else []
    if not source and row and row.reachable:
        for i, key in enumerate(row.reachable.favorable_keys[:6]):
            lever = key.split(":", 1)[0]
            hint = hint_for(lever)
            levers.append(
                _item(
                    "levers",
                    i,
                    f"杠杆 {key}" + (f"：{hint.label}" if hint else ""),
                    depends_on=[key],
                    evidence=list(hint.evidence[:4]) if hint else [],
                    article=hint.article if hint else None,
                )
            )
    for i, delta in enumerate(source[:6]):
        levers.append(
            _item(
                "levers",
                i,
                f"{delta.label}（Δ{delta.delta_pct:+.1f}%）",
                depends_on=[delta.key],
                evidence=list(delta.evidence[:4]),
                article=delta.article,
                delta_pct=delta.delta_pct,
            )
        )
    if not levers:
        levers.append(_item("levers", 0, "当前没有可切换且会改变份额的杠杆，先守住法定基线。"))
    risks = [
        _item("risks", 0, "当庭承认自己有能力却未尽扶养义务（admit_neglect）会少分 3 个百分点（第1130条）。", article="1130"),
        _item("risks", 1, "明确放弃部分应得份额（waive_share）会少分 3 个百分点（第1132条）。", article="1132"),
        _item("risks", 2, "协商阶段可用 concede 表达谈判让步，但它本身不改变份额；放弃份额必须由玩家显式确认。", article="1132"),
    ]
    return Brief(
        member_id=member_id,
        baseline=baseline,
        reachable=reachable,
        levers=levers,
        risks=risks,
        generated_by="rules",
    )


def _convert_items(
    section: str,
    rows: list[BriefItemOut],
    warnings: list[str],
    member_id: str,
) -> list[BriefItem]:
    items: list[BriefItem] = []
    for index, row in enumerate(rows):
        article = row.article
        if article and article not in ARTICLES:
            warnings.append(f"{member_id} 简报 {section} 引用了未知法条 {article}，已忽略")
            article = None
        confidence = row.confidence if row.confidence in {"high", "medium", "low", "abstain"} else None
        items.append(
            BriefItem(
                id=f"{section}-{index}",
                text=row.text,
                enabled=True,
                depends_on=list(row.depends_on),
                evidence=list(row.evidence),
                article=article,
                delta_pct=row.delta_pct,
                confidence=confidence,
            )
        )
    return items


def brief_from_out(member_id: str, out: BriefOut, generated_by: str, warnings: list[str]) -> Brief:
    return Brief(
        member_id=member_id,
        baseline=_convert_items("baseline", out.baseline, warnings, member_id),
        reachable=_convert_items("reachable", out.reachable, warnings, member_id),
        levers=_convert_items("levers", out.levers, warnings, member_id),
        asset_strategy=_convert_items("asset_strategy", out.asset_strategy, warnings, member_id),
        playbook=_convert_items("playbook", out.playbook, warnings, member_id),
        opponents=_convert_items("opponents", out.opponents, warnings, member_id),
        risks=_convert_items("risks", out.risks, warnings, member_id),
        generated_by=generated_by,
    )


async def generate_briefs(
    client: LLMClient,
    case: CaseInput,
    legal,
    analysis: SeatAnalysis,
    all_goals: dict[str, Goals],
    player_id: str,
    *,
    complete: CompleteFn | None = None,
) -> tuple[dict[str, Brief], list[str]]:
    warnings: list[str] = []

    async def one(member_id: str) -> tuple[str, Brief, list[str]]:
        local: list[str] = []
        try:
            out = await complete_schema(
                client,
                brief_messages(case, legal, analysis, member_id, all_goals, player_id),
                BriefOut,
                complete=complete,
            )
            return member_id, brief_from_out(member_id, out, client.label, local), local
        except AdvisorUnavailable:
            local.append(f"{member_id} 军师简报失败，已回退规则版")
            return member_id, rules_brief(analysis, member_id), local

    results = await asyncio.gather(*[one(mid) for mid in _playable_ids(case)])
    briefs: dict[str, Brief] = {}
    for member_id, brief, local in results:
        briefs[member_id] = brief
        warnings.extend(local)
    return briefs, warnings


async def generate_matrix_summary(
    client: LLMClient,
    case: CaseInput,
    legal,
    analysis: SeatAnalysis,
    all_goals: dict[str, Goals],
    player_id: str,
    *,
    complete: CompleteFn | None = None,
) -> tuple[dict[str, tuple[str, str]], list[str]]:
    try:
        out = await complete_schema(
            client,
            matrix_messages(case, legal, analysis, all_goals, player_id),
            MatrixSummaryOut,
            complete=complete,
        )
    except AdvisorUnavailable:
        return {}, ["矩阵策略要点生成失败，已保留规则粗估"]
    return {row.member_id: (row.strategy_summary, row.threat_level) for row in out.rows}, []


def seat_secret_strings(case: CaseInput) -> list[str]:
    if case.seat is None:
        return []
    secrets: list[str] = []
    player_id = case.seat.player_id

    def take_goals(goals: Goals) -> None:
        if goals.min_value_share is not None:
            secrets.append(f"最低价值份额：{goals.min_value_share:g}%")
            secrets.append(f"最低价值份额：{goals.min_value_share:.1f}%")
        if goals.narrative.strip():
            secrets.append(goals.narrative.strip())
        for item in (*goals.red_lines, *goals.soft_goals):
            if item.text.strip():
                secrets.append(item.text.strip())

    player = case.seat.goals.get(player_id)
    if player:
        take_goals(player)
    for member_id, goals in case.seat.goals.items():
        if member_id == player_id or goals.source != "user":
            continue
        take_goals(goals)
    return list(dict.fromkeys(s for s in secrets if s))


def _merge_matrix(matrix: list[MatrixRow], summaries: dict[str, tuple[str, str]]) -> list[MatrixRow]:
    merged: list[MatrixRow] = []
    for row in matrix:
        extra = summaries.get(row.member_id)
        if extra is None:
            merged.append(row)
            continue
        summary, threat = extra
        merged.append(
            row.model_copy(update={"strategy_summary": summary[:80], "threat_level": threat})
        )
    return merged


async def build_strategy(case: CaseInput, settings: Settings, providers, *, complete: CompleteFn | None = None) -> StrategyPack:
    if case.seat is None:
        raise ValueError("缺少席位配置")
    analysis = analyze(case)
    from ..legal import compute_legal_shares

    legal = compute_legal_shares(case)
    all_goals = merged_goals(case, legal)
    resolved = resolve_advisor(case, settings, providers)
    warnings = list(analysis.warnings)
    if resolved is None:
        briefs = {mid: rules_brief(analysis, mid) for mid in _playable_ids(case)}
        warnings.append("未接入军师模型，简报为规则版；剧本对手不会执行策略")
        return StrategyPack(
            player_id=case.seat.player_id,
            matrix=analysis.matrix,
            briefs=briefs,
            game=analysis.game,
            reachability=analysis.reachability,
            whatif=analysis.whatif,
            evidence_checklist=analysis.evidence_checklist,
            warnings=warnings,
            generated_by="rules",
            generated_at=time.time(),
        )

    client, label = resolved
    brief_task = generate_briefs(client, case, legal, analysis, all_goals, case.seat.player_id, complete=complete)
    matrix_task = generate_matrix_summary(client, case, legal, analysis, all_goals, case.seat.player_id, complete=complete)
    (briefs, brief_warnings), (summaries, matrix_warnings) = await asyncio.gather(brief_task, matrix_task)
    warnings.extend(brief_warnings)
    warnings.extend(matrix_warnings)
    return StrategyPack(
        player_id=case.seat.player_id,
        matrix=_merge_matrix(analysis.matrix, summaries),
        briefs=briefs,
        game=analysis.game,
        reachability=analysis.reachability,
        whatif=analysis.whatif,
        evidence_checklist=analysis.evidence_checklist,
        warnings=warnings,
        generated_by=label,
        generated_at=time.time(),
    )


def _sanitize_card(card: CardOut, attendees: list[str], assets: list[str], player_id: str) -> dict | None:
    admission = card.suggests_admission
    if admission and not admission.startswith("acknowledge_support:"):
        return None
    if admission and admission.startswith("acknowledge_support:"):
        who = admission.split(":", 1)[1]
        if who not in attendees or who == player_id:
            admission = None
    responds = card.responds_to if card.responds_to in attendees else None
    claims = {k: float(v) for k, v in card.claims.items() if k in assets}
    return {
        "title": card.title,
        "text": card.text,
        "responds_to": responds,
        "action": card.action or "propose",
        "claims": claims,
        "suggests_admission": admission,
        "serves": [card.serves] if card.serves else [],
        "risk_note": card.risk_note,
    }


async def generate_cards(
    client: LLMClient,
    case: CaseInput,
    legal,
    brief_enabled_items: list[dict],
    phase: str,
    round_no: int,
    focus: str | None,
    transcript_text: str,
    attacked_by_name: str | None,
    *,
    player_id: str,
    attendees: list[str],
    assets: list[str],
    complete: CompleteFn | None = None,
) -> list[dict]:
    out = await complete_schema(
        client,
        cards_messages(
            case, legal, brief_enabled_items, phase, round_no, focus,
            transcript_text, attacked_by_name,
        ),
        CardsOut,
        complete=complete,
        max_tokens=2000,
    )
    cards = []
    for i, card in enumerate(out.cards):
        clean = _sanitize_card(card, attendees, assets, player_id)
        if clean is None:
            continue
        clean["id"] = f"{player_id}-{phase}-{round_no}-{i}"
        cards.append(clean)
    if len(cards) < 2:
        raise AdvisorUnavailable("军师发言卡含有非法自认建议或有效卡片不足")
    return cards


async def extract_meta(
    client: LLMClient,
    text: str,
    participants: list[str],
    assets: list[str],
    *,
    complete: CompleteFn | None = None,
) -> dict:
    out = await complete_schema(
        client,
        meta_messages(text, participants, assets),
        MetaOut,
        complete=complete,
        max_tokens=400,
    )
    action = out.action if out.action in {"attack", "ally", "propose", "concede", "plead"} else "propose"
    target = out.target if out.target in participants else None
    claims = {k: float(v) for k, v in out.claims.items() if k in assets}
    return {"action": action, "target": target, "claims": claims}


async def generate_debrief(
    client: LLMClient,
    case: CaseInput,
    legal,
    verdict: dict,
    transcript_text: str,
    all_goals: dict[str, Goals],
    player_brief_enabled: list[dict],
    player_id: str,
    *,
    complete: CompleteFn | None = None,
) -> DebriefOut:
    result = await complete_schema(
        client,
        debrief_messages(case, legal, verdict, transcript_text, all_goals, player_brief_enabled, player_id),
        DebriefOut,
        complete=complete,
        max_tokens=3000,
    )
    expected_soft = {
        member_id: {str(index) for index in range(len(goals.soft_goals))}
        for member_id, goals in all_goals.items()
        if goals.soft_goals
    }
    expected_custom = {
        member_id: {
            str(index) for index, red_line in enumerate(goals.red_lines)
            if red_line.kind == "custom"
        }
        for member_id, goals in all_goals.items()
        if any(red_line.kind == "custom" for red_line in goals.red_lines)
    }
    actual_soft = {
        member_id: set(scores)
        for member_id, scores in result.soft_scores.items()
        if scores
    }
    actual_custom = {
        member_id: set(scores)
        for member_id, scores in result.custom_red_lines.items()
        if scores
    }
    if actual_soft != expected_soft:
        raise AdvisorUnavailable(
            f"军师软目标评分索引不完整：期望 {expected_soft}，实际 {actual_soft}"
        )
    if actual_custom != expected_custom:
        raise AdvisorUnavailable(
            f"军师自定义红线评分索引不完整：期望 {expected_custom}，实际 {actual_custom}"
        )
    return result
