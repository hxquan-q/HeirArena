# T04 · 对手诉求默认推断

- 阶段：0 确定性层
- 依赖：T01
- 范围：后端 `backend/app/seat/analysis.py` 新增函数、测试并入 `backend/tests/test_seat_analysis.py`
- 规模：S

## 目标

为没有用户填写诉求的成员生成一份确定性的结构化 `Goals`（`source="inferred"`），来源只有三样：`wish`、人设、法定地位。它是矩阵与对手简报的输入，用户可在第 IV 卷编辑或"恢复系统推断"。模型不得修改任何诉求。

## 设计依据

README「诉求」：对手诉求由确定性规则推断，用户可编辑；LLM 不修改诉求。

## 现状锚点

- `backend/app/agents/allocator.py`：`default_preferences(members, assets)` 已把 `wish` 关键词与人设换算成对每项资产的偏好权重（`WISH_KEYWORDS`、`BASE_PREF`、`RELATION_BONUS`）。
- `backend/app/agents/personas.py`：`default_wish(m, assets_hint)`（人设默认心愿）。
- `backend/app/models.py`（T01）：`Goals RedLine SoftGoal`。

## 实施步骤

1. `infer_goals(case, member_id, legal) -> Goals`：
   - `target_assets`：按 `default_preferences` 该成员行的偏好 × `(1 + value / max_value)` 排序，取前 3；宠物 / AI 分身不推断（返回空 Goals）。
   - `min_value_share`：`greedy calculating lawyer` → 该成员法定份额（四舍五入到整数）；其余 `None`。
   - `red_lines`：`filial`/`loyal` 且存在 `sentimental` 资产 → `no_sell_asset(该资产)`；`spouse` 且存在 `house` → `no_sell_asset(house)`；`lawyer`/`calculating` → `not_below_legal`。上限 3 条。
   - `soft_goals`：`spouse` 且有 `house` → `keep_residence(house)`；`filial`/`loyal` 且有 `pet` 资产 → `pet_custody(pet)`；`drama` → `recognition`；`chill`/`filial` → `keep_relation(份额最高的其他继承人)`。上限 3 条。
   - `narrative`：`wish` 非空用 `wish`，否则 `default_wish`。
2. `infer_all_goals(case, legal, player_id) -> dict[str, Goals]`：对除玩家外的所有非宠物非 AI 在世成员推断；已在 `case.seat.goals` 中且 `source="user"` 的成员保留用户版本不覆盖。
3. 输出必须能通过 T01 的 `CaseInput` 校验（引用的 id 均存在）。

## 验收标准

1. 预设「猫比儿子亲」：儿子（greedy）`target_assets[0]` 是学区房，`min_value_share` 等于其法定份额整数；女儿（filial）含 `no_sell_asset(相册)` 或 `pet_custody(橘猫)`。
2. 前任（`ex_spouse`）得到非空 `target_assets` 但 `min_value_share is None`、无 `not_below_legal`。
3. 宠物与 AI 分身返回 `Goals()` 空对象。
4. `source="user"` 的既有诉求不被覆盖。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_analysis.py; .venv/Scripts/python -m pytest -q
```

## 边界

不调模型；不写前端；不改 `allocator.py`（只调用）。
