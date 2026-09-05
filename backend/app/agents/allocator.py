"""把'每人应得的百分比'落到'具体哪件资产归谁'——按偏好分配不可分物，用可分财产找平。"""
from __future__ import annotations

from ..models import Asset, CaseInput, LegalResult, Member

Allocation = dict[str, dict[str, float]]  # asset_id -> member_id -> percent(0-100)

BASE_PREF: dict[str, dict[str, float]] = {
    "greedy": {"house": 1.0, "crypto": 1.0, "cash": 0.9, "car": 0.8, "equity": 0.9, "stock": 0.8,
               "collectible": 0.5, "nft": 0.6, "pet": 0.05, "other": 0.5},
    "filial": {"pet": 1.0, "collectible": 0.9, "nft": 0.3, "house": 0.6, "cash": 0.4, "car": 0.3,
               "crypto": 0.2, "stock": 0.3, "equity": 0.3, "other": 0.6},
    "chill": {"cash": 0.6, "house": 0.4, "car": 0.4, "crypto": 0.3, "pet": 0.5, "collectible": 0.4,
              "nft": 0.3, "stock": 0.4, "equity": 0.3, "other": 0.4},
    "calculating": {"stock": 0.9, "equity": 0.95, "crypto": 0.9, "house": 0.7, "cash": 0.8, "car": 0.4,
                    "collectible": 0.3, "nft": 0.5, "pet": 0.05, "other": 0.4},
    "drama": {"house": 0.9, "car": 0.9, "collectible": 0.7, "cash": 0.6, "crypto": 0.4, "nft": 0.6,
              "pet": 0.3, "stock": 0.4, "equity": 0.5, "other": 0.5},
    "lawyer": {"cash": 0.9, "house": 0.8, "stock": 0.7, "equity": 0.7, "crypto": 0.5, "car": 0.5,
               "collectible": 0.3, "nft": 0.3, "pet": 0.1, "other": 0.4},
    "loyal": {"pet": 0.9, "collectible": 0.6, "house": 0.5, "cash": 0.5, "car": 0.3, "crypto": 0.2,
              "nft": 0.2, "stock": 0.3, "equity": 0.3, "other": 0.4},
    "mischief": {"nft": 0.9, "crypto": 0.8, "car": 0.7, "collectible": 0.6, "house": 0.5, "cash": 0.5,
                 "pet": 0.4, "stock": 0.4, "equity": 0.4, "other": 0.6},
}

RELATION_BONUS: dict[str, dict[str, float]] = {
    "spouse": {"house": 0.3, "car": 0.1},
    "father": {"cash": 0.3, "house": -0.2},
    "mother": {"cash": 0.3, "house": -0.2, "pet": 0.2},
    "grandchild": {"crypto": 0.2, "nft": 0.3},
}

WISH_KEYWORDS: dict[str, list[str]] = {
    "house": ["房", "屋", "宅", "公寓", "别墅"],
    "car": ["车"],
    "cash": ["钱", "存款", "现金"],
    "crypto": ["币", "比特", "以太", "加密"],
    "nft": ["nft", "数字藏品", "头像"],
    "pet": ["猫", "狗", "宠物"],
    "collectible": ["收藏", "照片", "相册", "家书", "手表", "茶壶", "字画", "古董", "手办"],
    "stock": ["股票", "基金"],
    "equity": ["公司", "股权", "股份"],
}


def default_preferences(members: list[Member], assets: list[Asset]) -> dict[str, dict[str, float]]:
    prefs: dict[str, dict[str, float]] = {}
    for m in members:
        base = BASE_PREF.get(m.personality, BASE_PREF["chill"])
        bonus = RELATION_BONUS.get(m.relation, {})
        wish = (m.wish or "").lower()
        row: dict[str, float] = {}
        for a in assets:
            w = base.get(a.type, 0.4) + bonus.get(a.type, 0.0)
            if a.sentimental and m.personality in {"filial", "loyal"}:
                w += 0.3
            if any(k in wish for k in WISH_KEYWORDS.get(a.type, [])) or (a.name and a.name.lower() in wish):
                w += 0.4
            row[a.id] = max(0.05, min(1.6, w))
        prefs[m.id] = row
    return prefs


def _round_fix(row: dict[str, float]) -> dict[str, float]:
    """四舍五入到 1 位小数，并把误差补到最大份额上，保证合计 100。"""
    if not row:
        return row
    rounded = {k: round(v, 1) for k, v in row.items() if v > 0.049}
    if not rounded:
        return {}
    diff = round(100.0 - sum(rounded.values()), 1)
    top = max(rounded, key=rounded.get)
    rounded[top] = round(rounded[top] + diff, 1)
    return rounded


Compensation = dict[str, float | str]  # {"from": id, "to": id, "amount": 万元}


def settle_compensations(case: CaseInput, legal: LegalResult, allocation: Allocation,
                         targets: dict[str, float]) -> list[Compensation]:
    """拿到不可分割大件而'超额'的人，向没拿够的人支付折价补偿（第1156条）。"""
    est = legal.estate_total
    got = _estate_value(case, legal, allocation)
    diff = {mid: got.get(mid, 0.0) - est * pct / 100 for mid, pct in targets.items() if pct > 0}
    threshold = max(0.5, est * 0.01)
    payers = sorted([(m, d) for m, d in diff.items() if d > threshold], key=lambda x: -x[1])
    payees = sorted([(m, -d) for m, d in diff.items() if d < -threshold], key=lambda x: -x[1])
    out: list[Compensation] = []
    i = j = 0
    while i < len(payers) and j < len(payees):
        p, surplus = payers[i]
        r, deficit = payees[j]
        amt = min(surplus, deficit)
        if amt > threshold / 2:
            out.append({"from": p, "to": r, "amount": round(amt, 1)})
        payers[i] = (p, surplus - amt)
        payees[j] = (r, deficit - amt)
        if payers[i][1] <= threshold / 2:
            i += 1
        if payees[j][1] <= threshold / 2:
            j += 1
    return out


def _estate_value(case: CaseInput, legal: LegalResult, allocation: Allocation) -> dict[str, float]:
    spouse_id = legal.spouse_id
    got: dict[str, float] = {}
    for a in case.assets:
        for mid, pct in allocation.get(a.id, {}).items():
            share = a.value * pct / 100
            if mid == spouse_id and a.joint:
                share -= a.value / 2  # 去掉析产部分
            got[mid] = got.get(mid, 0.0) + max(share, 0.0)
    return got


def allocate(case: CaseInput, legal: LegalResult, targets: dict[str, float],
             prefs: dict[str, dict[str, float]]) -> Allocation:
    """targets: member_id -> 应得遗产净额的百分比（合计 100）。返回每件资产的归属比例。"""
    heirs = [mid for mid, pct in targets.items() if pct > 0]
    if not heirs:
        return {a.id: {"__state__": 100.0} for a in case.assets}

    spouse_id = legal.spouse_id
    estate_total = max(legal.estate_total, 0.0001)
    target_value = {mid: estate_total * pct / 100 for mid, pct in targets.items() if pct > 0}
    remaining = dict(target_value)
    allocation: Allocation = {}

    def estate_portion(a: Asset) -> float:
        return a.value / 2 if (a.joint and spouse_id) else a.value

    def community_half(a: Asset) -> dict[str, float]:
        return {spouse_id: 50.0} if (a.joint and spouse_id) else {}

    indivisible = sorted([a for a in case.assets if not a.divisible], key=lambda a: -a.value)
    divisible = sorted([a for a in case.assets if a.divisible], key=lambda a: -a.value)

    for a in indivisible:
        portion = estate_portion(a)
        row = community_half(a)
        est_share = 100.0 - sum(row.values())
        if portion <= 0:
            best = max(heirs, key=lambda h: prefs.get(h, {}).get(a.id, 0.4))
            row[best] = row.get(best, 0) + est_share
            allocation[a.id] = _round_fix(row)
            continue

        def score(h: str) -> float:
            pref = prefs.get(h, {}).get(a.id, 0.4)
            cap = max(remaining.get(h, 0.0), 0.0) / portion
            return pref * (0.35 + min(cap, 1.2))

        ranked = sorted(heirs, key=score, reverse=True)
        best = ranked[0]
        if remaining.get(best, 0) >= 0.35 * portion or len(heirs) == 1:
            # 整件归一人，超出部分之后通过折价补偿找平（第1156条）
            row[best] = row.get(best, 0) + est_share
            remaining[best] = remaining.get(best, 0) - portion
        else:
            # 没人"吃得下"整件 → 按份共有（第1156条），按剩余额度比例分
            pool = [h for h in ranked[:3] if remaining.get(h, 0) > 0] or ranked[:2]
            total_cap = sum(max(remaining.get(h, 0), 0.01) for h in pool)
            for h in pool:
                frac = max(remaining.get(h, 0), 0.01) / total_cap
                row[h] = row.get(h, 0) + est_share * frac
                remaining[h] = remaining.get(h, 0) - portion * frac
        allocation[a.id] = _round_fix(row)

    for a in divisible:
        portion = estate_portion(a)
        row = community_half(a)
        est_share = 100.0 - sum(row.values())
        positive = {h: v for h, v in remaining.items() if v > 0}
        if positive:
            total = sum(positive.values())
            for h, v in positive.items():
                frac = v / total
                row[h] = row.get(h, 0) + est_share * frac
                remaining[h] = v - portion * frac
        else:
            total = sum(target_value.values())
            for h, v in target_value.items():
                row[h] = row.get(h, 0) + est_share * v / total
        allocation[a.id] = _round_fix(row)

    return allocation


def value_shares(case: CaseInput, legal: LegalResult, allocation: Allocation,
                 compensations: list[Compensation] | None = None) -> dict[str, float]:
    """每人实际拿到的遗产净额百分比（不含配偶的共同财产析产部分，含折价补偿收支）。"""
    got = _estate_value(case, legal, allocation)
    for c in compensations or []:
        got[str(c["from"])] = got.get(str(c["from"]), 0.0) - float(c["amount"])
        got[str(c["to"])] = got.get(str(c["to"]), 0.0) + float(c["amount"])
    est = max(legal.estate_total, 0.0001)
    return {mid: round(max(v, 0.0) / est * 100, 1) for mid, v in got.items()}


def member_value(case: CaseInput, allocation: Allocation,
                 compensations: list[Compensation] | None = None) -> dict[str, float]:
    """每人实际取得的财产价值（万元，含析产与折价补偿收支）。"""
    got: dict[str, float] = {}
    for a in case.assets:
        for mid, pct in allocation.get(a.id, {}).items():
            got[mid] = got.get(mid, 0.0) + a.value * pct / 100
    for c in compensations or []:
        got[str(c["from"])] = got.get(str(c["from"]), 0.0) - float(c["amount"])
        got[str(c["to"])] = got.get(str(c["to"]), 0.0) + float(c["amount"])
    return {k: round(v, 1) for k, v in got.items()}
