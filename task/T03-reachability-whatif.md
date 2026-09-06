# T03 · 可达区间与 what-if 差分

- 阶段：0 确定性层
- 依赖：T01 T02
- 范围：后端新文件 `backend/app/seat/__init__.py`、`backend/app/seat/analysis.py`、新测试 `backend/tests/test_seat_analysis.py`
- 规模：M

## 目标

给定案情与玩家 id，纯函数地算出：① 每个可切换事实对玩家法定份额的差分（what-if 列表，附举证清单）；② 可达区间：我方有利事实全开的上限、对方不利事实全开的下限；③ 两端各跑一次分配器得到价值份额区间。全部复用规则引擎与分配器，不调模型。

## 设计依据

README「诉求」可达区间与非阻断警告；「what-if 含夫妻共同财产标记，估值不做切换」；口径以价值份额为准同时展示名义份额。

## 现状锚点

- `backend/app/legal/engine.py`：`compute_legal_shares(case) -> LegalResult`（`shares[].percent`、`estate_total`）。
- `backend/app/agents/allocator.py`：`default_preferences(members, assets)`、`allocate(case, legal, targets, prefs)`、`settle_compensations(...)`、`value_shares(...)`、`member_value(...)`；`DIVISIBLE_TYPES` 在 `models.py`。
- `backend/app/legal/evidence.py`（T02）：`hint_for`。

## 实施步骤

1. 在 `analysis.py` 定义可切换事实的枚举函数 `toggleable_facts(case, player_id) -> list[Toggle]`，`Toggle = (key, subject_id, kind, current_value)`：
   - 玩家自身：`main_support cohabit hardship`（当前为 False 的才可切为 True）；玩家为 `stepchild` 时加 `dependency`；`daughter_in_law/son_in_law/dependent/friend` 时 `main_support`（以及 `hardship`）。
   - 对每位其他非宠物非 AI 在世成员：`neglect`（切为 True）；`main_support cohabit hardship`（切为 True，属于对方有利）；不切 `disqualified` 与 `deceased`（前者由法院认定、后者不是"可证明的争议事实"）。
   - 每项资产：`joint` 翻转（True↔False）。
   - 玩家自身的 `neglect`（切为 True）作为对方可证明的不利事实。
2. `whatif(case, player_id) -> list[WhatIfDelta]`：对每个 Toggle 复制案情、翻转、`compute_legal_shares`，记录玩家 `percent` 差分；`direction = favorable if delta > 0 else adverse`；差分绝对值 < 0.05 的丢弃；`evidence` 取自 `hint_for(lever)`（资产 joint → `"joint"`）；`label` 形如"证明 周晓 尽了主要扶养义务"/"证明 周明 有能力却未尽扶养义务"/"主张 学区房 为夫妻共同财产"。
3. `reachability(case, player_id) -> Reachability`：`favorable_keys` = 所有 direction=favorable 且"由我方可证明"的键（我自身的加分事实、对方的 `neglect`、对我有利方向的 joint 翻转）；`adverse_keys` = 对方可证明的不利事实（对方的加分事实、我的 `neglect`、对我不利方向的 joint 翻转）。`high` = 全部 favorable 同时打开后的玩家份额；`low` = 全部 adverse 同时打开后的份额；`legal_pct` = 当前份额。
4. 价值份额两端：对 high / low 两个情景，`targets = {member_id: percent}`（仅 eligible 且 >0），`prefs = default_preferences(...)`，若玩家有 `goals.target_assets` 则把这些资产的偏好设为 1.5；`allocate → settle_compensations → value_shares` 取玩家值填 `value_high / value_low`。玩家无份额（非继承人且无 1131 酌分）时价值区间为 0。
5. 导出 `toggleable_facts, whatif, reachability`；`__init__.py` 暴露公共函数。所有函数不得修改传入的 `case`（用 `model_copy(deep=True)`）。

## 验收标准

1. 预设「猫比儿子亲」以女儿为玩家：`main_support` 已为 True 不出现在可切列表；对儿子的 `neglect` 已为 True 不出现；房产 joint 翻转出现且方向为 adverse（配偶析产少了对女儿有利，所以翻成 False 是 favorable——以计算结果为准，测试断言 direction 与 delta 符号一致）。
2. `reachability.low <= legal_pct <= high`；`value_low <= value_high`。
3. 玩家为 `ex_spouse` 时 `legal_pct == 0`，what-if 列表可为空，不抛异常。
4. 所有 `WhatIfDelta.article` 在 `ARTICLES` 中；`evidence` 非空。
5. 传入 case 在调用后 `model_dump()` 不变。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_analysis.py; .venv/Scripts/python -m pytest -q
```

## 边界

不做对手诉求推断（T04）、不做博弈表（T05）、不做接口（T07）。
