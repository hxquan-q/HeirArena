"""杠杆 → 证据类型 → 法条。what-if、简报与导出都从这里取「需要什么证据」。"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from ..models import Member
from .articles import ARTICLES


@dataclass(frozen=True)
class EvidenceHint:
    lever: str
    label: str
    article: str
    evidence: tuple[str, ...]
    burden: str
    note: str = ""

    def as_dict(self) -> dict:
        d = asdict(self)
        d["evidence"] = list(self.evidence)
        return d


EVIDENCE_TABLE: dict[str, EvidenceHint] = {
    "main_support": EvidenceHint(
        lever="main_support",
        label="尽了主要扶养义务",
        article="1130",
        evidence=(
            "医疗费与护理费票据",
            "护工 / 保姆合同与付款记录",
            "住院陪护记录",
            "居委会或村委会证明",
            "邻居与亲友证人证言",
            "微信转账与聊天记录",
        ),
        burden="由主张多分的一方举证；其他继承人可对真实性与「主要」程度提出反证。",
    ),
    "cohabit": EvidenceHint(
        lever="cohabit",
        label="与被继承人共同生活",
        article="1130",
        evidence=(
            "户籍与经常居住地证明",
            "水电燃气缴费记录",
            "居委会或物业证明",
            "共同生活期间的照片与通信",
        ),
        burden="由主张共同生活的一方举证；短期借住或轮流照料通常不够。",
    ),
    "hardship": EvidenceHint(
        lever="hardship",
        label="生活困难且缺乏劳动能力",
        article="1130",
        evidence=(
            "残疾证或劳动能力鉴定",
            "低保 / 困难救助材料",
            "收入与支出流水",
            "医疗机构诊断证明",
        ),
        burden="由主张应当照顾的一方举证；「应当」照顾的门槛高于「可以」多分。",
    ),
    "neglect": EvidenceHint(
        lever="neglect",
        label="有能力却不尽扶养义务",
        article="1130",
        evidence=(
            "长期不联系与不探视的证据",
            "拒付赡养费记录",
            "居委会调解记录",
            "被继承人生前书信或录音",
        ),
        burden="通常由主张方举证，被指控方可反证自己曾履行义务或确无能力。",
    ),
    "dependency": EvidenceHint(
        lever="dependency",
        label="继子女存在扶养关系",
        article="1127",
        evidence=(
            "共同生活年限证明",
            "抚养费支出记录",
            "学校与医院记录",
            "户口迁入与监护材料",
        ),
        burden="由主张视同子女的继子女一方举证形成扶养关系。",
    ),
    "disqualified": EvidenceHint(
        lever="disqualified",
        label="丧失继承权",
        article="1125",
        evidence=(
            "刑事判决书",
            "伪造、篡改遗嘱的鉴定意见",
            "虐待或遗弃的生效裁判",
        ),
        burden="由主张丧失继承权的一方举证。",
        note="丧失继承权由法院认定，本庭不据此改变份额",
    ),
    "deceased": EvidenceHint(
        lever="deceased",
        label="先于被继承人死亡（代位）",
        article="1128",
        evidence=(
            "死亡证明",
            "户籍注销证明",
            "亲属关系证明",
        ),
        burden="由主张代位继承的晚辈直系血亲举证被代位人先亡及亲子关系。",
    ),
    "joint": EvidenceHint(
        lever="joint",
        label="夫妻共同财产",
        article="1153",
        evidence=(
            "结婚证与购房时间",
            "不动产登记簿",
            "出资来源与银行流水",
            "夫妻财产约定",
        ),
        burden="由主张属于共同财产或主张属于个人财产的一方，就结婚时间、出资与登记举证。",
    ),
    "inlaw_support": EvidenceHint(
        lever="inlaw_support",
        label="丧偶儿媳 / 女婿尽主要赡养义务",
        article="1129",
        evidence=(
            "丧偶事实证明",
            "长期照料与共同生活证据",
            "医疗陪护与费用支出",
            "居委会或亲友证言",
        ),
        burden="由丧偶儿媳或女婿举证「尽了主要赡养义务」，才能作为第一顺序继承人。",
    ),
    "dependent_support": EvidenceHint(
        lever="dependent_support",
        label="继承人以外的扶养 / 被扶养",
        article="1131",
        evidence=(
            "长期依靠被继承人生活的证明",
            "对被继承人扶养较多的支出与照料记录",
            "居委会或单位证明",
            "无其他生活来源的材料",
        ),
        burden="由主张酌分的被扶养人或扶养较多的人举证；酌分不是法定继承份额。",
    ),
}


def hint_for(lever: str) -> EvidenceHint | None:
    return EVIDENCE_TABLE.get(lever)


def hints_for_member(member: Member) -> list[EvidenceHint]:
    if member.relation in {"pet", "ai_twin"}:
        return []
    levers: list[str] = ["main_support", "cohabit", "hardship", "neglect"]
    if member.relation == "stepchild":
        levers.append("dependency")
    if member.relation in {"daughter_in_law", "son_in_law"}:
        levers.append("inlaw_support")
    if member.relation in {"dependent", "friend"}:
        levers.append("dependent_support")
    if member.relation == "spouse":
        levers.append("joint")
    if member.relation in {"son", "daughter", "stepchild"}:
        levers.append("deceased")
    levers.append("disqualified")
    return [EVIDENCE_TABLE[k] for k in levers if k in EVIDENCE_TABLE]


def _assert_table() -> None:
    for hint in EVIDENCE_TABLE.values():
        if hint.article not in ARTICLES:
            raise RuntimeError(f"evidence table article {hint.article} missing")


_assert_table()
