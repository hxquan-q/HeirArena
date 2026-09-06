# T20 · 席位初值、军师模型槽位、开庭提交与后端校验

- 阶段：2 设置页
- 依赖：T19
- 范围：前端 `frontend/src/pages/SetupPage.tsx`、`frontend/src/components/seat/SeatChapter.tsx`；后端 `backend/app/main.py`（`create_session`）、`backend/app/agents/orchestrator.py`（`build_session` / `_emit_session_start`）、测试并入 `backend/tests/test_seat_api.py`
- 规模：M

## 目标

补齐第 IV 卷最后两块（席位初值开关、军师模型槽位），让「开庭」把 `seat`（含已生成并编辑过的 `strategy`）提交到后端；后端校验席位配置与军师模型引用，并把席位信息带进 `session_start` 事件（仅告知前端谁是玩家与席位状态，不含诉求 / 简报）。

## 设计依据

README「入口」（军师槽位在第 I 卷模型分配面板、旁观时提示仅入局使用）；「庭审交互」席位开关初值；执行官盲判（`session_start` 的 `case` 字段目前会把整个 `CaseInput` 下发给前端——入局模式下必须剔除 `seat.strategy` 中对手的简报？**不需要**：矩阵与全员简报在开庭前用户就能看到，前端拿到不构成泄露；但要保证后端执行官提示词不读它，那由 T11 保证）。

## 现状锚点

- `SetupPage` 第 I 卷「模型分配」面板：两个 `ModelSelect`（`default_model` / `executor_model`），`inheritLabel` 的写法。
- `main.py create_session`：`_validate_ref(case.default_model, …)`、成员模型校验、`build_session(case, legal, settings, PROVIDERS)`。
- `orchestrator._emit_session_start`：`"case": self.case.model_dump()`。
- `useCaseDraft`：`advisorModel / setAdvisorModel / setSeatHuman`（T13）。

## 实施步骤

1. 第 I 卷模型分配面板追加第三个 `ModelSelect`「军师（入局模式）」：值 `advisorModel`，`inheritLabel` "跟随执行官（…）"，`allowMock={false}`；旁观模式时下方小字"仅入局推演使用"。
2. `SeatChapter`「席位初值与军师」槽位：`PixelSwitch`「开庭后本席由我发言」（`setSeatHuman`）+ 说明"随时可在庭审中切换；关着时由 AI 代理按简报发言"；显示当前军师模型标签与「去第 I 卷修改」链接。
3. 「开庭」前置检查（前端）：入局模式且 `strategy === null` 时弹 `PixelAlertDialog`"还没有推演策略，AI 代理将只按人设与心愿发言，确定开庭？"，可继续。
4. 后端 `create_session`：`case.seat` 非空时 `_validate_ref(case.seat.advisor_model, "军师")`；`seat.strategy` 存在但 `player_id` 不一致 → 400；`seat.goals` 缺玩家条目 → 用 `goalsFromWish` 等价的后端推断补齐（调用 T04 `infer_goals`）。
5. `_emit_session_start` 的 payload 增加 `"seat": {"player_id", "seat_human"} | None`——**不放** goals / briefs / matrix（前端已在草稿里持有整份 `strategy`，庭审页从 `case.seat.strategy` 读；`case` 字段已完整下发 `CaseInput`，包含 `seat`，因此无需重复）。确认 `case.model_dump()` 含 `seat` 且 `test_court_persist.py` 的重建路径能反序列化（`CaseInput.model_validate(case_json)`）。
6. `build_session` 的 `specs`：玩家的 `AgentSpec.title` 保持不变（不暴露"玩家"字样给执行官提示词——`_people_block` 读的是 Member，不是 spec，确认无泄露）。

## 验收标准

1. 入局模式开庭：请求体含 `seat`（`player_id / goals / seat_human / advisor_model / strategy`），后端 200，`session_start.case.seat.player_id` 等于所选；旁观模式请求体 `seat: null`，`session_start` 事件与改动前字段一致（多出的 `seat: null` 除外——若测试快照严格，则旁观时不输出该键）。
2. 军师引用不存在的供应商 → 400 且中文提示含"军师"。
3. 重启后 `rebuild_session` 能恢复带 `seat` 的案件（在 `test_court_persist.py` 风格下新增一例）。
4. `npm run build`、后端全量测试通过。

## 验证命令

```powershell
cd frontend; npm run build
cd ../backend; .venv/Scripts/python -m pytest -q
```

## 边界

不做庭审页；不做等待玩家。
