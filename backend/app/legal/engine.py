"""法定继承规则引擎：依据《民法典》继承编计算各继承人的参考份额。

这是整个系统的"确定性锚点"——多 Agent 辩论再热闹，最终裁决都必须围绕这里算出的
法定份额进行有限调整，避免大模型胡说八道。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..models import CaseInput, HeirShare, LegalResult, Member
from .articles import ARTICLES

FIRST_ORDER_CHILD = {"son", "daughter", "stepchild"}
FIRST_ORDER_PARENT = {"father", "mother"}
SECOND_ORDER = {"sibling", "grandparent"}

# 1130 条的酌情调整系数
W_HARDSHIP = 0.35      # 生活特殊困难且缺乏劳动能力 → 应当照顾
W_MAIN_SUPPORT = 0.35  # 尽了主要扶养义务 → 可以多分
W_COHABIT = 0.15       # 共同生活 → 可以多分
W_NEGLECT = 0.4        # 有能力不尽义务 → 应当不分或少分（乘法系数）
DEPENDENT_CARVEOUT = 5.0   # 1131 条：继承人以外的被扶养人，酌情各分 5%
DEPENDENT_CARVEOUT_MAX = 15.0


@dataclass
class _Unit:
    """一个'股'（按股继承单元）。正常继承人一人一股；先亡子女的一股由其晚辈直系血亲代位分享。"""
    head: Member
    heirs: list[Member]
    weight: float = 1.0
    basis: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    via: str | None = None


def compute_legal_shares(case: CaseInput) -> LegalResult:
    members = case.members
    by_id = {m.id: m for m in members}
    steps: list[str] = []
    used: set[str] = {"1123", "1127"}
    shares: list[HeirShare] = []

    gross_total = sum(a.value for a in case.assets)
    steps.append(f"遗产总额（估值）合计 {gross_total:.1f} 万元。（第1122条）")
    used.add("1122")

    # ---- 1. 夫妻共同财产先析产（1153） ----
    spouse = next((m for m in members if m.relation == "spouse" and not m.deceased), None)
    community_deduction = 0.0
    joint_assets = [a for a in case.assets if a.joint]
    if spouse and joint_assets:
        community_deduction = sum(a.value for a in joint_assets) / 2
        used.add("1153")
        names = "、".join(a.name for a in joint_assets)
        steps.append(
            f"{names} 属于夫妻共同财产，先析出一半（{community_deduction:.1f} 万元）归配偶 {spouse.name} 所有，"
            f"其余部分才是遗产。（第1153条）"
        )
    elif joint_assets and not spouse:
        steps.append("标记为夫妻共同财产的资产因无在世配偶，视为被继承人个人财产处理。")
    estate_total = gross_total - community_deduction
    steps.append(f"可供继承的遗产净额为 {estate_total:.1f} 万元。")

    # ---- 2. 逐个成员判定资格 ----
    units: list[_Unit] = []
    excluded: list[HeirShare] = []

    def exclude(m: Member, note: str, basis: list[str] | None = None) -> None:
        excluded.append(HeirShare(
            member_id=m.id, name=m.name, relation=m.label, eligible=False,
            basis=basis or [], notes=[note],
        ))

    children_by_id: dict[str, Member] = {m.id: m for m in members if m.relation in FIRST_ORDER_CHILD}
    grandchildren = [m for m in members if m.relation == "grandchild"]

    for m in members:
        r = m.relation
        if m.disqualified and r not in {"pet", "ai_twin", "ex_spouse"}:
            used.add("1125")
            exclude(m, "存在民法典第1125条规定的情形，丧失继承权。", ["1125"])
            continue

        if r == "spouse":
            if m.deceased:
                exclude(m, "配偶先于被继承人死亡，不参与继承。")
            else:
                units.append(_Unit(head=m, heirs=[m], basis=["1127"], notes=["第一顺序继承人：配偶。"]))
        elif r in FIRST_ORDER_CHILD:
            if r == "stepchild" and not m.dependency:
                exclude(m, "继子女与被继承人之间无扶养关系，不属于第1127条所称'子女'。", ["1127"])
                continue
            if m.deceased:
                descendants = [g for g in grandchildren if g.parent_id == m.id and not g.deceased and not g.disqualified]
                if descendants:
                    used.add("1128")
                    units.append(_Unit(
                        head=m, heirs=descendants, basis=["1127", "1128"],
                        notes=[f"{m.name} 先于被继承人死亡，其应继份由 {len(descendants)} 名晚辈直系血亲代位继承。"],
                        via=m.name,
                    ))
                    exclude(m, f"先于被继承人死亡，由其晚辈直系血亲代位继承其份额。", ["1128"])
                else:
                    exclude(m, "先于被继承人死亡且无晚辈直系血亲代位，不参与分配。", ["1128"])
                continue
            note = "第一顺序继承人：子女。" if r != "stepchild" else "有扶养关系的继子女，视同子女，第一顺序继承人。"
            units.append(_Unit(head=m, heirs=[m], basis=["1127"], notes=[note]))
        elif r in FIRST_ORDER_PARENT:
            if m.deceased:
                exclude(m, "父/母先于被继承人死亡，不参与继承。")
            else:
                units.append(_Unit(head=m, heirs=[m], basis=["1127"], notes=["第一顺序继承人：父母。"]))
        elif r == "grandchild":
            parent = by_id.get(m.parent_id or "")
            if parent is None or not parent.deceased:
                exclude(m, "其父/母仍在世（或未指定），不发生代位继承；孙子女本身不是法定继承人。", ["1128"])
            elif parent.disqualified:
                exclude(m, "被代位人丧失继承权，其晚辈直系血亲不得代位继承（继承编解释一第16条）。", ["1125", "1128"])
            # 有效的代位情形已在其父/母的单元中处理
        elif r in {"daughter_in_law", "son_in_law"}:
            if m.main_support:
                used.add("1129")
                units.append(_Unit(
                    head=m, heirs=[m], basis=["1129", "1127"],
                    notes=["丧偶儿媳/女婿对公婆/岳父母尽了主要赡养义务，作为第一顺序继承人。"],
                ))
            else:
                exclude(m, "儿媳/女婿不是法定继承人；仅在丧偶且尽了主要赡养义务时才能成为第一顺序继承人。", ["1129"])
        elif r in SECOND_ORDER:
            if m.deceased:
                exclude(m, "先于被继承人死亡，不参与继承。")
            else:
                units.append(_Unit(head=m, heirs=[m], basis=["1127"], notes=["第二顺序继承人。"]))
        elif r == "ex_spouse":
            exclude(m, "已离婚，婚姻关系不存在，不是法定继承人。（如对未分割的共同财产有主张，属于另案析产，不在遗产分配之列。）", ["1127"])
        elif r == "pet":
            exclude(m, "宠物在法律上属于遗产（财产），不是继承人；可通过附义务的方式指定照护人。（第1122、1144条）", ["1122", "1144"])
            used.add("1144")
        elif r == "ai_twin":
            exclude(m, "AI 数字分身不是民事主体，没有继承权，但它可以替亡者'说话'。")
        else:  # dependent / friend
            if m.main_support or m.hardship:
                used.add("1131")
                excluded.append(HeirShare(
                    member_id=m.id, name=m.name, relation=m.label, eligible=True, order=None,
                    basis=["1131"],
                    notes=["继承人以外依靠被继承人扶养的人，或对被继承人扶养较多的人，可以分给适当的遗产。"],
                ))
            else:
                exclude(m, "不是法定继承人，也未提供扶养事实，不参与分配。", ["1127"])

    # ---- 3. 顺序选择 ----
    first = [u for u in units if u.head.relation not in SECOND_ORDER]
    second = [u for u in units if u.head.relation in SECOND_ORDER]
    if first:
        active, order_used = first, 1
        steps.append(
            "存在第一顺序继承人（配偶、子女、父母），由第一顺序继承人继承，第二顺序继承人不继承。（第1127条）"
        )
        for u in second:
            exclude(u.head, "有第一顺序继承人时，第二顺序继承人不继承。", ["1127"])
    elif second:
        active, order_used = second, 2
        steps.append("没有第一顺序继承人，由第二顺序继承人（兄弟姐妹、祖父母、外祖父母）继承。（第1127条）")
    else:
        active, order_used = [], 0
        used.add("1160")
        steps.append("没有任何法定继承人，遗产归国家所有，用于公益事业。（第1160条）")

    # ---- 4. 继承人以外的被扶养人酌分（1131） ----
    dependents = [s for s in excluded if s.eligible and "1131" in s.basis]
    carveout_each = 0.0
    if dependents and active:
        carveout_each = min(DEPENDENT_CARVEOUT, DEPENDENT_CARVEOUT_MAX / len(dependents))
        for s in dependents:
            s.percent = round(carveout_each, 2)
        steps.append(
            f"继承人以外的被扶养人 {'、'.join(s.name for s in dependents)} 酌情各分得 {carveout_each:.1f}%。（第1131条）"
        )
    remaining = 100.0 - carveout_each * len(dependents)

    # ---- 5. 同一顺序按股均等 + 1130 调整 ----
    if active:
        used.add("1130")
        steps.append(f"同一顺序共 {len(active)} 股，一般应当均等，每股基础 {remaining / len(active):.1f}%。（第1130条）")
        for u in active:
            h = u.head
            if u.via:
                continue  # 代位单元的调整看代位人自身情况，简化处理为均等
            adj = 1.0
            if h.hardship:
                adj += W_HARDSHIP
                u.notes.append("生活有特殊困难又缺乏劳动能力，分配时应当予以照顾 → 上调。")
                u.basis.append("1130")
            if h.main_support:
                adj += W_MAIN_SUPPORT
                u.notes.append("对被继承人尽了主要扶养义务 → 可以多分。")
                u.basis.append("1130")
            if h.cohabit:
                adj += W_COHABIT
                u.notes.append("与被继承人共同生活 → 可以多分。")
                u.basis.append("1130")
            if h.neglect:
                adj *= W_NEGLECT
                u.notes.append("有扶养能力和条件却不尽扶养义务 → 应当少分。")
                u.basis.append("1130")
            u.weight = adj
            if adj != 1.0:
                steps.append(f"{h.name}：依第1130条酌情调整，权重 {adj:.2f}。")

        total_w = sum(u.weight for u in active)
        for u in active:
            unit_pct = remaining * u.weight / total_w
            per = unit_pct / len(u.heirs)
            for heir in u.heirs:
                notes = list(u.notes)
                if u.via:
                    notes.append(f"代位继承 {u.via} 应得份额的 1/{len(u.heirs)}。")
                shares.append(HeirShare(
                    member_id=heir.id, name=heir.name, relation=heir.label, eligible=True,
                    order=order_used, percent=round(per, 2), weight=round(u.weight, 3),
                    basis=sorted(set(u.basis)), notes=notes, via=u.via,
                ))

    shares.extend(excluded)
    # 让前端稳定排序：有份额的在前
    shares.sort(key=lambda s: (-s.percent, s.name))

    used.add("1132")
    steps.append("以上为法定参考份额；继承人协商一致的，也可以不均等。（第1130、1132条）")

    return LegalResult(
        order_used=order_used,
        shares=shares,
        steps=steps,
        articles={k: ARTICLES[k] for k in sorted(used) if k in ARTICLES},
        gross_total=round(gross_total, 2),
        community_deduction=round(community_deduction, 2),
        estate_total=round(estate_total, 2),
        spouse_id=spouse.id if spouse else None,
        dependents_carveout=round(carveout_each * len(dependents), 2),
    )
