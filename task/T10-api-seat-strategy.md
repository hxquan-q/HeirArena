# T10 · 接口 `POST /api/seat/strategy` 与无模型降级

- 阶段：1 军师
- 依赖：T09
- 范围：后端 `backend/app/main.py`、`backend/app/seat/advisor.py` 组装函数、测试并入 `backend/tests/test_seat_api.py`
- 规模：S

## 目标

第 IV 卷「推演策略」按钮调用的接口：输入案情（含 `seat.goals`），输出完整 `StrategyPack`。有军师模型时补齐简报与矩阵要点；没有时返回确定性部分 + `rules_brief` + 警告，HTTP 仍为 200。

## 设计依据

README「军师与简报」开庭前生成、可反复重算；「结束与交付」降级运行。

## 现状锚点

- `main.py`：`parse_case` 的错误映射（`CaseParseError → 422`、`LLMError → 502`）。
- T07 `analyze`、T09 `generate_briefs / generate_matrix_summary / rules_brief`、T08 `resolve_advisor / AdvisorUnavailable`。

## 实施步骤

1. `advisor.py` 增加 `async def build_strategy(case, settings, providers) -> StrategyPack`：
   1. `analysis = analyze(case)`；`all_goals` = 用户版优先 + 推断补齐。
   2. `resolved = resolve_advisor(case, settings, providers)`；为 `None` 时 `briefs = {m: rules_brief(...)}`，矩阵要点为空，`warnings += ["未接入军师模型，简报为规则版；剧本对手不会执行策略"]`，`generated_by="rules"`。
   3. 有模型时并行生成简报与矩阵要点；矩阵行合并 `strategy_summary / threat_level`（模型给的等级覆盖规则粗估）。
   4. `StrategyPack(..., generated_at=time.time())`。
2. `main.py` 新增 `@app.post("/api/seat/strategy")`：入参 `CaseInput`（必须带 `seat`）；`AdvisorUnavailable` 或 `LLMError` → 502 并带简短原因；返回 `model_dump()`。
3. 不持久化；结果由前端放入 `case.seat.strategy` 随开庭提交。

## 验收标准

1. 无任何供应商时返回 200，`generated_by == "rules"`，`warnings` 含"未接入军师模型"，`briefs` 覆盖全员且第⑦节非空。
2. 用可注入的假客户端（通过 monkeypatch `resolve_advisor`）返回合法 JSON 时 `generated_by` 为模型标签，矩阵 `strategy_summary` 非空。
3. 假客户端持续返回非法 JSON → 200，但对应成员为规则简报、warnings 记录（单成员失败不拖垮整体）。
4. 不带 `seat` → 422。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_api.py; .venv/Scripts/python -m pytest -q
```

## 边界

不改 `create_session`；不做前端。
