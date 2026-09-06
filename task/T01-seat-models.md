# T01 · 席位数据模型与校验

- 阶段：0 确定性层
- 依赖：无
- 范围：后端 `backend/app/models.py`、新测试 `backend/tests/test_seat_models.py`
- 规模：S

## 目标

定义「入局推演」全部共享数据结构（诉求、简报、矩阵、博弈表、记分卡、席位配置），挂到 `CaseInput.seat`，并在 pydantic 层完成结构校验。这是后续所有后端与前端类型的唯一权威定义；前端 `types.ts`（T12）必须与此逐字段对齐。

## 设计依据

README「诉求」「军师与简报」「结束与交付」各节；命名空间 `seat`。

## 现状锚点

- `backend/app/models.py`：`Asset` / `Member` / `CaseInput`（`CaseInput` 字段 `decedent_name story assets members rounds speed discretion default_model executor_model`），`ModelRef`。pydantic 默认配置，未知字段静默忽略。
- 三种符号化事实与步长：`backend/app/agents/orchestrator.py` 的 `ADMISSION_SELF`、`ADMISSION_PREFIX_OTHER`、`_fact_based_plan`（−3 / −3 / −1.5 / +2）。

## 实施步骤

1. 在 `models.py` 新增以下模型（全部 `model_config = ConfigDict(extra="forbid")`，字段长度上限如注）：

```python
RedLineKind = Literal["no_sell_asset", "no_member_gets_asset", "not_below_legal", "no_co_own_asset", "custom"]
class RedLine(BaseModel):
    kind: RedLineKind
    asset_id: str | None = None
    member_id: str | None = None
    text: str = ""            # ≤200，仅 custom 使用

SoftGoalKind = Literal["keep_relation", "pet_custody", "keep_residence", "recognition", "custom"]
class SoftGoal(BaseModel):
    kind: SoftGoalKind
    member_id: str | None = None
    asset_id: str | None = None
    text: str = ""            # ≤200

class Goals(BaseModel):
    target_assets: list[str] = []          # 资产 id，有序，≤5
    min_value_share: float | None = None   # 0~100，价值份额口径
    red_lines: list[RedLine] = []          # ≤6
    soft_goals: list[SoftGoal] = []        # ≤6
    narrative: str = ""                    # ≤600，给代理演的自由文本
    source: Literal["user", "inferred"] = "inferred"

class BriefItem(BaseModel):
    id: str; text: str                     # text ≤160
    enabled: bool = True; custom: bool = False
    depends_on: list[str] = []             # 事实键，如 "main_support:m_zhou_xiao"、"joint:a_house"
    evidence: list[str] = []; article: str | None = None
    delta_pct: float | None = None
    confidence: Literal["high", "medium", "low", "abstain"] | None = None

class Brief(BaseModel):
    member_id: str
    baseline: list[BriefItem] = []; reachable: list[BriefItem] = []
    levers: list[BriefItem] = []; asset_strategy: list[BriefItem] = []
    playbook: list[BriefItem] = []; opponents: list[BriefItem] = []
    risks: list[BriefItem] = []
    generated_by: str = "rules"            # 模型标签或 "rules"

class WhatIfDelta(BaseModel):
    key: str                               # "main_support:m_x" / "neglect:m_y" / "joint:a_house"
    subject_id: str; label: str; article: str
    delta_pct: float                       # 对玩家法定份额的影响
    direction: Literal["favorable", "adverse"]
    evidence: list[str] = []

class Reachability(BaseModel):
    legal_pct: float; low: float; high: float
    value_low: float | None = None; value_high: float | None = None
    favorable_keys: list[str] = []; adverse_keys: list[str] = []

class CoalitionRow(BaseModel):
    member_id: str; potential_confirmers: list[str]; gain_pct: float = 2.0
    exposure_from: list[str] = []          # 可能被谁指控（≥2 才有意义）
class AssetCompetitionRow(BaseModel):
    asset_id: str; competitors: list[str]; can_absorb: dict[str, bool]
    pref_score: dict[str, float]; predicted_winner: str | None
    compensation_needed: float             # 万元
class PayoffRow(BaseModel):
    option: str; label: str; my_value: float; my_value_share: float
    assets_obtained: list[str]; compensation_paid: float; compensation_received: float
class GameTables(BaseModel):
    coalition: list[CoalitionRow] = []; asset_competition: list[AssetCompetitionRow] = []
    payoff: list[PayoffRow] = []
    equilibrium: list[dict] = []           # T31 填充，此处仅占位

class ScorecardPart(BaseModel):
    key: Literal["target_assets", "min_share", "red_lines", "soft_goals"]
    label: str; score: float; max: float; applicable: bool = True
    detail: str = ""; turn_ids: list[str] = []
class Scorecard(BaseModel):
    member_id: str; parts: list[ScorecardPart]; total: float; capped: bool = False
    formula: str; value_share: float; nominal_pct: float; legal_pct: float

class MatrixRow(BaseModel):
    member_id: str; baseline_pct: float; reachable: Reachability | None = None
    target_assets: list[str] = []; conflicts_with_player: list[str] = []
    potential_allies: list[str] = []; strategy_summary: str = ""   # ≤80
    threat_level: Literal["high", "medium", "low", "none"] = "none"
    no_legal_share_reason: str | None = None
    achieved: Scorecard | None = None

class StrategyPack(BaseModel):
    player_id: str; matrix: list[MatrixRow]; briefs: dict[str, Brief]
    game: GameTables; reachability: Reachability; whatif: list[WhatIfDelta]
    evidence_checklist: list[dict] = []    # T02 的条目
    warnings: list[str] = []; generated_by: str = "rules"; generated_at: float = 0

class SeatConfig(BaseModel):
    player_id: str
    goals: dict[str, Goals] = {}
    seat_human: bool = False
    advisor_model: ModelRef | None = None
    strategy: StrategyPack | None = None
```

2. `CaseInput` 新增 `seat: SeatConfig | None = None`。旁观模式此字段为 `None`。
3. 增加一个 `@model_validator(mode="after")` 于 `CaseInput`：当 `seat` 不为 None 时校验 `player_id` 是现有成员且 `relation not in {"pet", "ai_twin"}` 且未 `deceased`；`goals` 的键、`target_assets`、`RedLine/SoftGoal` 的 `asset_id/member_id` 必须引用现有 id；`custom` 类必须有 `text`，非 custom 类不得有 `text`。校验失败抛 `ValueError`（FastAPI 会转 422）。
4. 导出 `__all__` 相应符号。不要改动任何现有字段的默认值。

## 验收标准

1. `CaseInput(...)` 不带 `seat` 的现有测试全部通过（`test_legal_engine.py`、`test_case_parser.py` 等）。
2. 新测试覆盖：合法 `SeatConfig` 通过；`player_id` 指向宠物 / 不存在成员 / 已故成员被拒；`target_assets` 含未知 id 被拒；`RedLine(kind="custom")` 无 `text` 被拒；`extra="forbid"` 生效。
3. `CaseInput.model_json_schema()` 能生成（供前端对照）。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_models.py; .venv/Scripts/python -m pytest -q
```

## 边界

不改 `case_parser.py`（导入解析不产出 seat）；不改前端；不实现任何计算逻辑。
