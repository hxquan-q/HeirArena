import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session, export_markdown  # noqa: E402
from app.agents.orchestrator import Turn  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Brief, BriefItem, Goals, RedLine, SoftGoal, StrategyPack  # noqa: E402
from app.seat import analyze, build_scorecard  # noqa: E402
from app.seat.analysis import merged_goals  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402

MOCK = Settings(api_key="", base_url="", model="", temperature=0.9, timeout=5, force_mock=True)
FIXTURES = Path(__file__).resolve().parent / "fixtures"

SEAT_HEADINGS = [
    "## 入局推演报告",
    "### 我的诉求",
    "### 我的策略简报",
    "### 全员策略矩阵",
    "### 博弈分析",
    "### what-if 对照与举证清单",
    "### 记分卡",
    "### 复盘与下一局建议",
]


def _norm(text: str) -> str:
    return text.replace("\r\n", "\n").rstrip("\n")


def _spectator_verdict() -> dict:
    return {
        "speech": "本院裁决如下。",
        "judgment": {"findings": "查明事实", "reasoning": "本院认为", "orders": ["房屋归配偶"]},
        "allocation": {
            "house": {"wife": 100.0},
            "btc": {"son": 50.0, "daughter": 50.0},
            "cash": {"daughter": 100.0},
            "cat": {"daughter": 100.0},
            "album": {"daughter": 100.0},
        },
        "compensations": [{"from": "wife", "to": "daughter", "amount": 10.0}],
        "targets": {"wife": 39.7, "son": 13.8, "daughter": 46.6},
        "value_shares": {"wife": 39.7, "son": 13.8, "daughter": 46.6},
        "member_value": {"wife": 199, "son": 69, "daughter": 233},
        "legal_percent": {"wife": 39.66, "son": 13.79, "daughter": 46.55},
        "adjustments": [
            {"member_id": "daughter", "reason": "主要扶养", "article": "1130", "delta": 2.0, "turn_ids": ["t1"]},
        ],
        "established_facts": [
            {
                "member_id": "daughter",
                "kind": "support_confirmed",
                "article": "1130",
                "text": "女儿尽了主要扶养义务",
                "turn_ids": ["t1"],
            },
        ],
        "open_questions": ["首付来源待核"],
        "unaddressed": [{"member_id": "son", "strongest": "主张房产", "missed": "未回应扶养"}],
        "settlement": {"overview": "可和解", "plans": [{"tier": "A", "title": "让步", "detail": "少要房"}]},
        "discretion": 5.0,
        "conditions": ["宠物照护"],
        "citations": ["1127", "1130"],
        "rationale": "按法定份额。",
        "disclaimer": "本裁决为依据《民法典》继承编计算的参考方案与一场娱乐化的多 Agent 模拟，不构成法律意见。",
        "estate_total": 501.5,
        "community_deduction": 300.0,
    }


def _attach_opening(session) -> None:
    session.transcript.append(
        Turn(turn_id="t1", agent_id="executor", name="遗嘱执行官", phase="opening", round_no=0, text="开庭。"),
    )


def _table_rows(md: str, heading: str) -> list[str]:
    lines = md.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == heading)
    rows: list[str] = []
    for line in lines[start + 1:]:
        if line.startswith("##"):
            break
        if line.startswith("|"):
            rows.append(line)
    return rows


def _assert_table_aligned(rows: list[str]) -> None:
    assert rows
    counts = [row.count("|") for row in rows]
    assert len(set(counts)) == 1, counts


def test_spectator_export_matches_pre_task_baseline():
    session = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK)
    assert session.case.seat is None
    got = export_markdown(session)
    want = (FIXTURES / "spectator_export.md").read_text(encoding="utf-8")
    assert got == want or _norm(got) == _norm(want)
    assert "入局推演报告" not in got


def test_spectator_verdict_export_matches_pre_task_baseline():
    session = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK)
    _attach_opening(session)
    session.verdict = _spectator_verdict()
    got = export_markdown(session)
    want = (FIXTURES / "spectator_export_verdict.md").read_text(encoding="utf-8")
    assert got == want or _norm(got) == _norm(want)
    assert "入局推演报告" not in got


def _seated_session(*, with_strategy: bool) -> object:
    case = seated(
        "daughter",
        {
            "daughter": Goals(
                target_assets=["album", "cat", "house"],
                min_value_share=40,
                red_lines=[RedLine(kind="no_member_gets_asset", asset_id="house", member_id="son")],
                soft_goals=[SoftGoal(kind="pet_custody", asset_id="cat")],
                narrative="想留下相册和大橘",
                source="user",
            ),
        },
    )
    legal = compute_legal_shares(case)
    analysis = analyze(case)
    if with_strategy:
        briefs = {
            "daughter": Brief(
                member_id="daughter",
                levers=[
                    BriefItem(
                        id="l1", text="证明主要扶养", enabled=True,
                        article="1130", delta_pct=3.2, confidence="high",
                    ),
                    BriefItem(id="l2", text="已禁用", enabled=False),
                ],
                playbook=[BriefItem(id="p1", text="开场要相册", enabled=True)],
                generated_by="rules",
            ),
            "son": Brief(
                member_id="son",
                levers=[BriefItem(id="sl1", text="争房产", enabled=True)],
                playbook=[
                    BriefItem(id="sp1", text="高锚定", enabled=True),
                    BriefItem(id="sp2", text="逼出售", enabled=True),
                    BriefItem(id="sp3", text="拉配偶", enabled=True),
                    BriefItem(id="sp4", text="不应出现", enabled=True),
                ],
                generated_by="rules",
            ),
        }
        case.seat.strategy = StrategyPack(
            player_id="daughter",
            matrix=analysis.matrix,
            briefs=briefs,
            game=analysis.game,
            reachability=analysis.reachability,
            whatif=analysis.whatif,
            evidence_checklist=analysis.evidence_checklist,
            generated_by="rules",
        )
    session = build_session(case, legal, MOCK)
    _attach_opening(session)
    session.transcript.append(
        Turn(
            turn_id="t2", agent_id="daughter", name="王小美",
            phase="statements", round_no=0, text="我要相册。",
            meta={"action": "propose", "by": "human"},
        ),
    )
    verdict = _spectator_verdict()
    session.verdict = verdict
    scorecards = {
        mid: build_scorecard(goals, verdict, mid)
        for mid, goals in (case.seat.goals | {row.member_id: Goals() for row in analysis.matrix}).items()
        if mid in {m.id for m in case.members}
    }
    # 只给有诉求的成员记分卡（玩家 + 矩阵行里有目标的人）
    scored = {}
    player_goals = case.seat.goals["daughter"]
    scored["daughter"] = build_scorecard(player_goals, verdict, "daughter")
    for row in analysis.matrix:
        if row.member_id == "daughter":
            continue
        g = case.seat.goals.get(row.member_id) or Goals(target_assets=row.target_assets, source="inferred")
        scored[row.member_id] = build_scorecard(g, verdict, row.member_id)
    assert session.seat is not None
    session.seat.debrief = {
        "scorecards": {mid: card.model_dump() for mid, card in scored.items()},
        "narrative": None,
        "next_time": [],
        "whatif_recap": [w.model_dump() for w in analysis.whatif],
        "generated_by": "rules",
    }
    return session, scored


def test_seat_export_contains_report_sections_and_aligned_tables():
    session, scored = _seated_session(with_strategy=True)
    md = export_markdown(session)
    for heading in SEAT_HEADINGS:
        assert heading in md, heading
    assert "不接受 王大宝 取得 学区房" in md
    assert "想留下相册和大橘" in md
    assert "自由文本：房子和比特币" in md
    assert "证明主要扶养" in md
    assert "由主张多分的一方举证" in md
    assert "丧失继承权由法院认定" in md
    assert "已禁用" not in md
    assert "不应出现" not in md
    assert "亲自发言" in md
    assert str(scored["daughter"].total) in md
    matrix_rows = [
        row for row in _table_rows(md, "### 全员策略矩阵")
        if set(row.replace("|", "").replace(" ", "").replace(":", "")) != {"-"}
    ]
    all_goals = merged_goals(session.case, session.legal, session.case.seat.player_id)
    expected_members = {
        member.id for member in session.case.members
        if not member.deceased
        and member.relation not in {"pet", "ai_twin"}
        and member.id in all_goals
    }
    assert len(matrix_rows) - 1 == len(expected_members)
    _assert_table_aligned(_table_rows(md, "### 全员策略矩阵"))
    disclaimer_at = md.rfind("> 本裁决")
    report_at = md.find("## 入局推演报告")
    assert 0 <= report_at < disclaimer_at


def test_seat_export_without_strategy_still_renders():
    session, _ = _seated_session(with_strategy=False)
    md = export_markdown(session)
    assert "## 入局推演报告" in md
    assert "开庭前未推演策略" in md
    assert "未接入军师模型，未生成叙事复盘" in md


def test_normalize_meta_keeps_human_by():
    session = build_session(cat_case(), compute_legal_shares(cat_case()), MOCK)
    orch = Orchestrator(session)
    meta = orch._normalize_meta("daughter", {"action": "propose", "by": "human"})
    assert meta["by"] == "human"
    meta2 = orch._normalize_meta("daughter", {"action": "propose", "by": "agent"})
    assert "by" not in meta2
