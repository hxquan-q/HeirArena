from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

AssetType = Literal[
    "house", "car", "cash", "crypto", "nft", "pet", "collectible", "stock", "equity", "other"
]

Relation = Literal[
    "spouse",            # 配偶
    "son",               # 儿子
    "daughter",          # 女儿
    "stepchild",         # 继子女（需有扶养关系）
    "father",            # 父亲
    "mother",            # 母亲
    "grandchild",        # 孙子女 / 外孙子女（代位继承）
    "daughter_in_law",   # 儿媳（丧偶儿媳尽主要赡养义务 → 第一顺序）
    "son_in_law",        # 女婿
    "sibling",           # 兄弟姐妹（第二顺序）
    "grandparent",       # 祖父母 / 外祖父母（第二顺序）
    "ex_spouse",         # 前任（无继承权，但可能闹）
    "dependent",         # 继承人以外的被扶养人 / 扶养较多的人（1131 酌情分给）
    "pet",               # 宠物（法律上是财产，但它有话要说）
    "ai_twin",           # 亡者的 AI 数字分身
    "friend",            # 朋友 / 其他
]

Personality = Literal[
    "greedy",       # 贪婪
    "filial",       # 孝顺 / 重感情
    "chill",        # 佛系
    "calculating",  # 精算师
    "drama",        # 戏精
    "lawyer",       # 律师型
    "loyal",        # 忠诚（宠物 / 分身）
    "mischief",     # 捣蛋
]

DIVISIBLE_TYPES = {"cash", "crypto", "stock", "equity", "other"}

ASSET_EMOJI = {
    "house": "🏠", "car": "🚗", "cash": "💰", "crypto": "🪙", "nft": "🖼️",
    "pet": "🐾", "collectible": "🏺", "stock": "📈", "equity": "🏢", "other": "📦",
}

RELATION_LABEL = {
    "spouse": "配偶", "son": "儿子", "daughter": "女儿", "stepchild": "继子女",
    "father": "父亲", "mother": "母亲", "grandchild": "孙子女", "daughter_in_law": "儿媳",
    "son_in_law": "女婿", "sibling": "兄弟姐妹", "grandparent": "祖父母/外祖父母",
    "ex_spouse": "前任", "dependent": "被扶养人", "pet": "宠物", "ai_twin": "AI 分身",
    "friend": "朋友",
}


class ModelRef(BaseModel):
    """指向某个供应商下的某个模型；provider_id == "mock" 表示该角色明确使用剧本模式。"""
    provider_id: str
    model: str = ""

    @property
    def is_mock(self) -> bool:
        return self.provider_id == "mock"


class Asset(BaseModel):
    id: str
    name: str
    type: AssetType = "other"
    value: float = Field(ge=0, description="估值，单位：万元")
    joint: bool = Field(default=False, description="夫妻共同财产")
    sentimental: bool = Field(default=False, description="有纪念意义")
    note: str = ""

    @property
    def divisible(self) -> bool:
        return self.type in DIVISIBLE_TYPES

    @property
    def emoji(self) -> str:
        return ASSET_EMOJI.get(self.type, "📦")


class Member(BaseModel):
    id: str
    name: str
    relation: Relation
    personality: Personality = "chill"
    deceased: bool = Field(default=False, description="先于被继承人死亡（触发代位继承）")
    parent_id: Optional[str] = Field(default=None, description="孙子女对应的父/母（被继承人的子女）")
    main_support: bool = Field(default=False, description="尽了主要扶养/赡养义务")
    hardship: bool = Field(default=False, description="生活有特殊困难且缺乏劳动能力")
    neglect: bool = Field(default=False, description="有扶养能力却不尽扶养义务")
    cohabit: bool = Field(default=False, description="与被继承人共同生活")
    dependency: bool = Field(default=False, description="继子女/继父母之间存在扶养关系")
    disqualified: bool = Field(default=False, description="丧失继承权（民法典 1125）")
    wish: str = Field(default="", description="TA 最想要什么 / 剧情设定")
    model: Optional[ModelRef] = Field(default=None, description="该角色使用的模型；None 表示跟随案件默认")

    @property
    def label(self) -> str:
        return RELATION_LABEL.get(self.relation, self.relation)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


RedLineKind = Literal["no_sell_asset", "no_member_gets_asset", "not_below_legal", "no_co_own_asset", "custom"]
SoftGoalKind = Literal["keep_relation", "pet_custody", "keep_residence", "recognition", "custom"]
ThreatLevel = Literal["high", "medium", "low", "none"]
Confidence = Literal["high", "medium", "low", "abstain"]
ScorePartKey = Literal["target_assets", "min_share", "red_lines", "soft_goals"]
EvidenceDirection = Literal["favorable", "adverse"]
EvidenceSubjectKind = Literal["member", "asset"]


class RedLine(_Strict):
    kind: RedLineKind
    asset_id: str | None = None
    member_id: str | None = None
    text: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _custom_text(self) -> RedLine:
        if self.kind == "custom":
            if not self.text.strip():
                raise ValueError("自定义红线必须填写说明")
        elif self.text:
            raise ValueError("非自定义红线不得填写自由文本")
        return self


class SoftGoal(_Strict):
    kind: SoftGoalKind
    member_id: str | None = None
    asset_id: str | None = None
    text: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _custom_text(self) -> SoftGoal:
        if self.kind == "custom":
            if not self.text.strip():
                raise ValueError("自定义软目标必须填写说明")
        elif self.text:
            raise ValueError("非自定义软目标不得填写自由文本")
        return self


class Goals(_Strict):
    target_assets: list[str] = Field(default_factory=list, max_length=5)
    min_value_share: float | None = Field(default=None, ge=0, le=100)
    red_lines: list[RedLine] = Field(default_factory=list, max_length=6)
    soft_goals: list[SoftGoal] = Field(default_factory=list, max_length=6)
    narrative: str = Field(default="", max_length=600)
    source: Literal["user", "inferred"] = "inferred"


class BriefItem(_Strict):
    id: str
    text: str = Field(max_length=160)
    enabled: bool = True
    custom: bool = False
    depends_on: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    article: str | None = None
    delta_pct: float | None = None
    confidence: Confidence | None = None


class Brief(_Strict):
    member_id: str
    baseline: list[BriefItem] = Field(default_factory=list)
    reachable: list[BriefItem] = Field(default_factory=list)
    levers: list[BriefItem] = Field(default_factory=list)
    asset_strategy: list[BriefItem] = Field(default_factory=list)
    playbook: list[BriefItem] = Field(default_factory=list)
    opponents: list[BriefItem] = Field(default_factory=list)
    risks: list[BriefItem] = Field(default_factory=list)
    generated_by: str = "rules"


class WhatIfDelta(_Strict):
    key: str
    subject_id: str
    label: str
    article: str
    delta_pct: float
    direction: Literal["favorable", "adverse"]
    evidence: list[str] = Field(default_factory=list)


class CourtEvidenceOption(_Strict):
    fact_key: str
    subject_id: str
    subject_name: str
    subject_kind: EvidenceSubjectKind
    lever: str
    label: str
    article: str
    delta_pct: float
    direction: EvidenceDirection
    evidence_types: list[str] = Field(min_length=1)
    burden: str
    note: str = ""


class CourtEvidence(_Strict):
    id: str
    turn_key: str
    submitted_by: str
    fact_key: str
    subject_id: str
    subject_name: str
    subject_kind: EvidenceSubjectKind
    lever: str
    label: str
    article: str
    delta_pct: float
    direction: EvidenceDirection
    evidence_type: str
    note: str = Field(min_length=2, max_length=240)
    submitted_at: float
    status: Literal["accepted_for_simulation"] = "accepted_for_simulation"


class Reachability(_Strict):
    legal_pct: float
    low: float
    high: float
    value_low: float | None = None
    value_high: float | None = None
    favorable_keys: list[str] = Field(default_factory=list)
    adverse_keys: list[str] = Field(default_factory=list)


class CoalitionRow(_Strict):
    member_id: str
    potential_confirmers: list[str] = Field(default_factory=list)
    gain_pct: float = 2.0
    exposure_from: list[str] = Field(default_factory=list)


class AssetCompetitionRow(_Strict):
    asset_id: str
    competitors: list[str] = Field(default_factory=list)
    can_absorb: dict[str, bool] = Field(default_factory=dict)
    pref_score: dict[str, float] = Field(default_factory=dict)
    predicted_winner: str | None = None
    compensation_needed: float = 0.0


class PayoffRow(_Strict):
    option: str
    label: str
    my_value: float
    my_value_share: float
    assets_obtained: list[str] = Field(default_factory=list)
    compensation_paid: float = 0.0
    compensation_received: float = 0.0


class EquilibriumRow(_Strict):
    profile: dict[str, str]
    payoffs: dict[str, float]
    my_value: float
    my_value_share: float
    stable: bool
    note: str = ""


class GameTables(_Strict):
    coalition: list[CoalitionRow] = Field(default_factory=list)
    asset_competition: list[AssetCompetitionRow] = Field(default_factory=list)
    payoff: list[PayoffRow] = Field(default_factory=list)
    equilibrium: list[EquilibriumRow] = Field(default_factory=list)


class ScorecardPart(_Strict):
    key: ScorePartKey
    label: str
    score: float
    max: float
    applicable: bool = True
    detail: str = ""
    turn_ids: list[str] = Field(default_factory=list)


class Scorecard(_Strict):
    member_id: str
    parts: list[ScorecardPart]
    total: float
    capped: bool = False
    formula: str
    value_share: float
    nominal_pct: float
    legal_pct: float


class MatrixRow(_Strict):
    member_id: str
    baseline_pct: float
    reachable: Reachability | None = None
    target_assets: list[str] = Field(default_factory=list)
    conflicts_with_player: list[str] = Field(default_factory=list)
    potential_allies: list[str] = Field(default_factory=list)
    strategy_summary: str = Field(default="", max_length=80)
    threat_level: ThreatLevel = "none"
    no_legal_share_reason: str | None = None
    achieved: Scorecard | None = None


class StrategyPack(_Strict):
    player_id: str
    matrix: list[MatrixRow]
    briefs: dict[str, Brief]
    game: GameTables
    reachability: Reachability
    whatif: list[WhatIfDelta]
    evidence_checklist: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    generated_by: str = "rules"
    generated_at: float = 0


class SeatConfig(_Strict):
    player_id: str
    goals: dict[str, Goals] = Field(default_factory=dict)
    seat_human: bool = False
    advisor_model: ModelRef | None = None
    strategy: StrategyPack | None = None


class SeatAnalysis(_Strict):
    player_id: str
    legal: dict[str, Any]
    reachability: Reachability
    whatif: list[WhatIfDelta]
    evidence_checklist: list[dict[str, Any]] = Field(default_factory=list)
    inferred_goals: dict[str, Goals] = Field(default_factory=dict)
    game: GameTables
    matrix: list[MatrixRow] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CaseInput(BaseModel):
    decedent_name: str = "老王"
    story: str = Field(default="", description="剧情设定：儿子不孝、女儿很爱我、最爱那只猫……")
    assets: list[Asset]
    members: list[Member]
    rounds: int = Field(default=2, ge=1, le=4)
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Mock 模式下的语速倍率")
    discretion: float = Field(
        default=5.0, ge=0.0, le=15.0,
        description="执行官相对法定份额的最大酌情偏移（百分点）。0 = 严格法定；5 = 参考模式；15 = 戏剧模式",
    )
    default_model: Optional[ModelRef] = Field(default=None, description="所有角色的默认模型；None 表示使用 .env 默认或剧本模式")
    executor_model: Optional[ModelRef] = Field(default=None, description="遗嘱执行官使用的模型；None 表示跟随默认")
    seat: SeatConfig | None = Field(default=None, description="入局推演席位；旁观模式为 None")

    @model_validator(mode="after")
    def _validate_seat(self) -> CaseInput:
        seat = self.seat
        if seat is None:
            return self
        members = {m.id: m for m in self.members}
        assets = {a.id: a for a in self.assets}
        player = members.get(seat.player_id)
        if player is None:
            raise ValueError("席位玩家不存在")
        if player.relation in {"pet", "ai_twin"}:
            raise ValueError("宠物与 AI 分身不能入局")
        if player.deceased:
            raise ValueError("已故成员不能入局")
        for member_id, goals in seat.goals.items():
            if member_id not in members:
                raise ValueError(f"诉求成员「{member_id}」不存在")
            for asset_id in goals.target_assets:
                if asset_id not in assets:
                    raise ValueError(f"目标资产「{asset_id}」不存在")
            for item in (*goals.red_lines, *goals.soft_goals):
                if item.asset_id and item.asset_id not in assets:
                    raise ValueError(f"引用了不存在的资产「{item.asset_id}」")
                if item.member_id and item.member_id not in members:
                    raise ValueError(f"引用了不存在的成员「{item.member_id}」")
        return self


class HeirShare(BaseModel):
    member_id: str
    name: str
    relation: str
    eligible: bool
    order: Optional[int] = None
    percent: float = 0.0
    weight: float = 0.0
    basis: list[str] = Field(default_factory=list, description="适用的法条编号")
    notes: list[str] = Field(default_factory=list)
    via: Optional[str] = Field(default=None, description="代位继承：代替谁")


class LegalResult(BaseModel):
    order_used: int
    shares: list[HeirShare]
    steps: list[str]
    articles: dict[str, str]
    gross_total: float
    community_deduction: float
    estate_total: float
    spouse_id: Optional[str] = None
    dependents_carveout: float = 0.0


__all__ = [
    "ASSET_EMOJI",
    "Asset",
    "AssetCompetitionRow",
    "AssetType",
    "Brief",
    "BriefItem",
    "CaseInput",
    "CoalitionRow",
    "CourtEvidence",
    "CourtEvidenceOption",
    "DIVISIBLE_TYPES",
    "EvidenceDirection",
    "EvidenceSubjectKind",
    "EquilibriumRow",
    "GameTables",
    "Goals",
    "HeirShare",
    "LegalResult",
    "MatrixRow",
    "Member",
    "ModelRef",
    "PayoffRow",
    "Personality",
    "RELATION_LABEL",
    "Reachability",
    "RedLine",
    "RedLineKind",
    "Relation",
    "Scorecard",
    "ScorecardPart",
    "SeatAnalysis",
    "SeatConfig",
    "SoftGoal",
    "SoftGoalKind",
    "StrategyPack",
    "WhatIfDelta",
]
