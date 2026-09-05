from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

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


class CaseInput(BaseModel):
    decedent_name: str = "老王"
    story: str = Field(default="", description="剧情设定：儿子不孝、女儿很爱我、最爱那只猫……")
    assets: list[Asset]
    members: list[Member]
    rounds: int = Field(default=2, ge=1, le=4)
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Mock 模式下的语速倍率")
    default_model: Optional[ModelRef] = Field(default=None, description="所有角色的默认模型；None 表示使用 .env 默认或剧本模式")
    executor_model: Optional[ModelRef] = Field(default=None, description="遗嘱执行官使用的模型；None 表示跟随默认")


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
