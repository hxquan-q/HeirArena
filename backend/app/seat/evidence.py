"""庭上结构化举证：把庭前 what-if 变成可审计、可重放的沙盘事实。"""
from __future__ import annotations

from collections.abc import Iterable

from ..legal import compute_legal_shares, hint_for
from ..models import CaseInput, CourtEvidence, CourtEvidenceOption, LegalResult
from .analysis import apply_keys, whatif


def court_evidence_options(case: CaseInput, player_id: str) -> list[CourtEvidenceOption]:
    """只开放规则引擎确实能计算、且有静态举证清单的 what-if。"""
    members = {member.id: member for member in case.members}
    assets = {asset.id: asset for asset in case.assets}
    options: list[CourtEvidenceOption] = []
    for row in whatif(case, player_id):
        lever, subject_id = row.key.split(":", 1)
        hint = hint_for(lever)
        if hint is None or not hint.evidence:
            continue
        if lever == "joint":
            subject = assets.get(subject_id)
            subject_kind = "asset"
        else:
            subject = members.get(subject_id)
            subject_kind = "member"
        if subject is None:
            continue
        options.append(CourtEvidenceOption(
            fact_key=row.key,
            subject_id=subject_id,
            subject_name=subject.name,
            subject_kind=subject_kind,
            lever=lever,
            label=row.label,
            article=row.article,
            delta_pct=row.delta_pct,
            direction=row.direction,
            evidence_types=list(hint.evidence),
            burden=hint.burden,
            note=hint.note,
        ))
    return options


def option_for(case: CaseInput, player_id: str, fact_key: str) -> CourtEvidenceOption | None:
    return next(
        (option for option in court_evidence_options(case, player_id) if option.fact_key == fact_key),
        None,
    )


def admitted_records(
    case: CaseInput,
    player_id: str,
    raw_records: Iterable[dict],
) -> list[CourtEvidence]:
    """重放前重新校验 extras，避免手改存储绕过事实与材料白名单。"""
    options = {option.fact_key: option for option in court_evidence_options(case, player_id)}
    accepted: list[CourtEvidence] = []
    seen: set[str] = set()
    for raw in raw_records:
        try:
            record = CourtEvidence.model_validate(raw)
        except (TypeError, ValueError):
            continue
        option = options.get(record.fact_key)
        if (
            option is None
            or record.fact_key in seen
            or record.submitted_by != player_id
            or record.evidence_type not in option.evidence_types
        ):
            continue
        # 权威字段来自当前规则表；用户只能提供材料类型与摘要。
        accepted.append(record.model_copy(update={
            "subject_id": option.subject_id,
            "subject_name": option.subject_name,
            "subject_kind": option.subject_kind,
            "lever": option.lever,
            "label": option.label,
            "article": option.article,
            "delta_pct": option.delta_pct,
            "direction": option.direction,
        }))
        seen.add(record.fact_key)
    return accepted


def adjudicated_case(
    case: CaseInput,
    player_id: str,
    raw_records: Iterable[dict],
) -> tuple[CaseInput, LegalResult, list[CourtEvidence]]:
    records = admitted_records(case, player_id, raw_records)
    effective_case = apply_keys(case, [record.fact_key for record in records])
    return effective_case, compute_legal_shares(effective_case), records


__all__ = ["adjudicated_case", "admitted_records", "court_evidence_options", "option_for"]
