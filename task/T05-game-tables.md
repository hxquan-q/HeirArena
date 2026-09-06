# T05 · 博弈表 a / b / c

- 阶段：0 确定性层
- 依赖：T01 T03 T04
- 范围：后端新文件 `backend/app/seat/game.py`、新测试 `backend/tests/test_seat_game.py`
- 规模：M

## 目标

用规则引擎与分配器这两个纯函数，确定性地算出三张博弈表：a 联盟可行性、b 不可分资产竞争表、c 玩家策略收益表。毫秒级、不调模型。d（均衡穷举）留给 T31，这里只保证 `GameTables.equilibrium` 占位为空。

## 设计依据

README「博弈层」；`acknowledge_support` 需 ≥2 位其他出席者确认（`orchestrator._fact_based_plan` 中 `support_ack` 判定 `len(ack) >= 2`，加 +2.0）；分配器"能否吃下整件"的阈值 `remaining >= 0.35 * portion`（`allocator.allocate`）。

## 现状锚点

- `backend/app/agents/allocator.py`：`allocate` 内部评分 `pref * (0.35 + min(cap, 1.2))`，`cap = remaining / portion`；`settle_compensations`、`value_shares`、`member_value`、`default_preferences`。
- `backend/app/agents/orchestrator.py`：`_fact_based_plan`（+2 / −3 / −1.5 步长）、`_bounded_targets`（份额夹在法定 ± discretion 后归一化）。
- T01 模型：`CoalitionRow AssetCompetitionRow PayoffRow GameTables`。

## 实施步骤

1. **a 联盟可行性** `coalition_table(case, legal, goals) -> list[CoalitionRow]`：对每位有份额的成员 X，`potential_confirmers` = 其他非宠物非 AI 在世成员中，与 X 没有共同 `target_assets` 的人（目标不冲突者有动机替 X 确认扶养）；`exposure_from` = 与 X 争同一资产、或 X 带 `neglect` 标记时的所有其他继承人；`gain_pct = 2.0`。
2. **b 资产竞争表** `asset_competition(case, legal, goals) -> list[AssetCompetitionRow]`：对每件不可分割资产（`not asset.divisible`）：`competitors` = `target_assets` 含该资产的成员 ∪ 默认偏好 ≥ 0.9 的成员；`can_absorb[m]` = `legal_pct[m]/100 * estate_total >= 0.35 * value`；`pref_score[m]` = `default_preferences` 的值 +0.5（若在其 `target_assets` 中，与发言 claims 的加成同量级）；`predicted_winner` = 按分配器同款公式 `pref * (0.35 + min(cap, 1.2))` 排序的第一名（无竞争者则 None）；`compensation_needed` = `max(0, value - legal_value_of_winner)`。
3. **c 玩家收益表** `payoff_table(case, legal, goals, player_id) -> list[PayoffRow]`：玩家的离散选项 = 对每个 `target_assets`（最多 3）"主张该资产 100%"、"只要可分财产"、以及每项叠加"协商阶段让步（−1.5）"共 ≤ 8 行。每行：`prefs` = 默认偏好，被主张资产设为 1.5；`targets` = 法定份额，让步时玩家 −1.5 并把差额按比例分给其他继承人（不引入 discretion，注释说明这是近似）；跑 `allocate → settle_compensations → value_shares / member_value`，填 `my_value / my_value_share / assets_obtained（该资产玩家份额 ≥50%）/ compensation_paid / compensation_received`。
4. `build_game_tables(case, legal, goals, player_id) -> GameTables`，`equilibrium=[]`。
5. 所有函数不得修改传入对象。

## 验收标准

1. 预设「猫比儿子亲」以女儿为玩家：竞争表里学区房的 `competitors` 至少含儿子与女儿（儿子 greedy 默认偏好高）；`predicted_winner` 属于 `competitors`。
2. 收益表行数 ≥ 2 且 ≤ 8；"主张学区房"一行的 `assets_obtained` 与 `compensation_paid` 一致（拿到房必有折价补偿或余额不足说明）。
3. 联盟表中玩家自己不出现在自己的 `potential_confirmers`；宠物、AI 分身不出现在任何 confirmers。
4. 玩家无份额（如前任）时收益表仍返回（全 0 值）且不抛异常。
5. 全部数值 `round(…, 1)`。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_game.py; .venv/Scripts/python -m pytest -q
```

## 边界

不做均衡穷举（T31）；不接接口（T07）；不调模型。
