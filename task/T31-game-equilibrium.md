# T31 · 博弈 d：对手最佳回应与稳定组合（均衡穷举）

- 阶段：5 博弈 d
- 依赖：T05 T19
- 范围：后端 `backend/app/seat/game.py`、`backend/app/models.py`（`EquilibriumRow`）、测试 `backend/tests/test_seat_game.py`；前端 `frontend/src/components/seat/GameTablesView.tsx`「均衡」tab、`frontend/src/types.ts`
- 规模：M

## 目标

在每位有份额成员的离散选项上穷举所有组合（≈ 4^5 量级），用分配器算每个人的到手价值，找出"没有人愿意单方面改变"的组合，标为"预计均衡结局"，并给出玩家在其中的收益；无纯策略均衡时给出最佳回应链说明。措辞面向律师与当事人。

## 设计依据

README「博弈层」d 紧随 MVP；确定性、不调模型。

## 现状锚点

- T05 `payoff_table` 的选项定义与分配器调用方式；`allocate / settle_compensations / member_value`。
- `GameTables.equilibrium: list[dict]` 占位；前端「均衡」tab 占位（T19）。

## 实施步骤

1. `models.py` 新增 `EquilibriumRow { profile: dict[str, str]（成员 → 选项标签）; payoffs: dict[str, float]（万元）; my_value: float; my_value_share: float; stable: bool; note: str }`；`GameTables.equilibrium: list[EquilibriumRow]`。
2. `game.py`：
   - `options_for(member, goals, case) -> list[Option]`：`target_assets` 前 2 件各一个"主张 100%"选项 + "只要可分财产"；成员 ≤ 6、选项 ≤ 3 → 组合 ≤ 729；成员更多时只对法定份额前 6 名穷举，其余固定为"只要可分财产"并在 `note` 说明。
   - `enumerate_profiles`：对每个组合构造 `prefs`（被主张资产 1.5）并跑分配器得 `member_value`。
   - `pure_equilibria`：对每个组合，检查每位成员换成其他选项是否能提高自己的 `member_value`（容差 0.05 万）；都不能 → `stable=True`。
   - 输出：所有稳定组合按玩家收益降序（最多 5 行）；若为空，返回玩家最佳回应下的 1 行 `stable=False`，`note="不存在所有人都满意的稳定组合：…（谁在哪一步会改主意）"`。
   - `build_game_tables` 填 `equilibrium`。
3. 前端「均衡」tab：表格（组合：每人主张什么 / 每人到手 / 我的收益）+ 顶部一句解释"如果每个人都按自己的最优打，最可能落在这里；这不是预测，是在当前事实下的稳定点"。`stable=False` 时 `PixelAlert` 显示 `note`。

## 验收标准

1. 预设「猫比儿子亲」：至少一行 `stable=True`（或返回带 note 的最佳回应行），运行时间 < 200ms。
2. 任一稳定组合中，把任意一人的选项改成其他选项后该人 `member_value` 不增加（测试随机抽 3 个组合验证）。
3. 成员超过 6 人时不超时且 `note` 说明了截断。
4. 前端 tab 渲染无类型错误；`npm run build` 通过；后端全量测试通过。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_game.py; .venv/Scripts/python -m pytest -q
cd ../frontend; npm run build
```

## 边界

不做混合策略、不做合作博弈解。
