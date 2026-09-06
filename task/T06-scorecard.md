# T06 · 记分卡计算

- 阶段：0 确定性层
- 依赖：T01
- 范围：后端新文件 `backend/app/seat/scoring.py`、新测试 `backend/tests/test_seat_scoring.py`
- 规模：M

## 目标

把裁决结果（`verdict` dict）和一份 `Goals` 换算成确定性的 `Scorecard`：目标资产 / 最低份额 / 红线三项由规则判定，软目标与自定义红线留给军师（T28）填入。公式公开、可复现。

## 设计依据

README「结束与交付」：40 / 30 / 20 / 10 分；红线破一条本项归零且总分上限 40；未设定的项不计分、总分按已设定项换算到 100。价值份额口径。

## 现状锚点

- `backend/app/agents/orchestrator.py` `_verdict` 产出的 verdict dict：`allocation: {asset_id: {member_id: pct}}`、`compensations: [{from,to,amount}]`、`targets: {member_id: pct}`（名义份额）、`value_shares: {member_id: pct}`、`member_value: {member_id: 万元}`、`legal_percent: {member_id: pct}`、`established_facts`。
- `allocation` 中 `"__state__"` 表示归国家。

## 实施步骤

1. `score_target_assets(goals, allocation, me) -> ScorecardPart`：取 `target_assets[:3]`，权重按数量：1 个 → [1.0]；2 个 → [0.7, 0.3]；≥3 个 → [0.6, 0.3, 0.1]。每项达成比例 = `allocation[asset].get(me, 0) / 100`。`score = 40 * Σ w_i * frac_i`；`detail` 列每项"拿到 x%"。无目标资产 → `applicable=False`。
2. `score_min_share(goals, value_shares, me)`：`vs = value_shares.get(me, 0)`；`vs >= min` → 30；否则 `30 * vs / min`（min>0）。`None` → `applicable=False`。
3. `evaluate_red_line(rl, allocation, value_shares, legal_percent, me) -> bool | None`（True=守住，False=破，None=需模型判定）：
   - `no_sell_asset`：资产被整件分给单一成员（某人 100%）为守住；被拆分或归国家为破。
   - `no_member_gets_asset`：`allocation[asset].get(member, 0) >= 50` 为破。
   - `not_below_legal`：`value_shares[me] < legal_percent[me] - 0.5` 为破。
   - `no_co_own_asset`：我与该成员在该资产上都 > 0 为破。
   - `custom` → None。
4. `score_red_lines(goals, ...)`：仅统计非 None 的；`score = 20 * kept / evaluated`；任一为 False → `broken=True`。无红线或全 None → `applicable=False`。
5. `build_scorecard(goals, verdict, me, soft_scores: dict[str, float] | None = None, custom_red_lines: dict[int, bool] | None = None) -> Scorecard`：
   - 软目标：若传入 `soft_scores`（每条 0~1）→ `10 * mean`；否则 `applicable=False`。
   - `custom_red_lines` 为军师对 custom 红线的判定，合并入第 4 步。
   - `total` = 各 applicable 项得分之和 / applicable 项满分之和 × 100；若红线 `broken` → `total = min(total, 40)`，`capped=True`。
   - `formula` 文案："目标资产 40 · 最低份额 30 · 红线 20 · 软目标 10；未设定项不计分，按已设定项换算到 100；红线被破总分上限 40"。
   - `value_share / nominal_pct / legal_pct` 从 verdict 取，缺省 0。
6. 所有分数 `round(…, 1)`。

## 验收标准

1. 全部达成（拿到第一目标 100%、份额达标、红线守住）且无软目标 → `total == 100`。
2. 红线被破一条、其他满分 → `total == 40`、`capped=True`。
3. 只设了目标资产（拿到 60%）→ `total == 60`（40×0.6 / 40 × 100）。
4. `custom` 红线在无军师判定时不影响 evaluated 计数；传入判定后计入。
5. 玩家不在 `targets` 中（无份额）→ `value_share == 0`，函数不抛异常。
6. 对 `test_orchestrator_mock.py` 中完整 mock 会话产出的真实 verdict 能直接计算。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_scoring.py; .venv/Scripts/python -m pytest -q
```

## 边界

不调模型；不接编排器（T28）；不做前端。
