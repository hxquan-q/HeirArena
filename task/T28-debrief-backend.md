# T28 · 后端 `_debrief`：全员记分卡 + 我的叙事复盘

- 阶段：4 复盘
- 依赖：T06 T22（有军师时还依赖 T08/T09 的基础设施）
- 范围：后端 `backend/app/agents/orchestrator.py`（`_debrief`、`graph_step` 裁决段）、`backend/app/seat/advisor.py`、`backend/app/seat/prompts.py`、新测试 `backend/tests/test_seat_debrief.py`
- 规模：M

## 目标

裁决落槌后、`done` 之前，为入局会话计算全员确定性记分卡，并用一次军师调用补齐软目标 / 自定义红线评分与玩家的叙事复盘 + 下一局建议；发出 `debrief` 事件并落库。执行官不参与复盘，仍然盲判。

## 设计依据

README「结束与交付」：记分卡全员、叙事只给玩家、一次调用、公式公开、降级。

## 现状锚点

- `orchestrator.graph_step` 裁决段：`if self.s.verdict is None: await self._verdict()` → `status="done"` → `emit("done", …)` → `persist_snapshot` → `_release`。`_debrief` 应插在 `_verdict` 之后、`done` 之前。
- `_verdict` 产出的 verdict dict 字段；`self.s.transcript`；`case.seat.goals`；`SeatRuntime.debrief`（T22）。
- T06 `build_scorecard(goals, verdict, me, soft_scores, custom_red_lines)`；T08 `complete_schema(DebriefOut)`、`resolve_advisor`；T03 `whatif`（复盘时再算一次作为 `whatif_recap`）。

## 实施步骤

1. `prompts.debrief_messages(case, legal, verdict, transcript_text, all_goals, player_brief_enabled, player_id)`：要求输出 `DebriefOut`：`soft_scores[member_id][index] ∈ [0,1]`（对全员每条软目标，附引用 `turn_ids` 的理由放在 `narrative` 之外的 `rationale` 字段，Schema 中加 `rationales: dict[str, list[str]]`）、`custom_red_lines[member_id][index] ∈ {true,false}`、玩家的 `narrative`（哪句发言起了作用、哪个对手论点没接住、哪次让步多余，引用 turn_id）、`next_time`（≤5 条，换什么策略 / 目标更现实，必须引用可达区间数字）。不可信声明、律师伦理同前。
2. `advisor.generate_debrief(client, …) -> DebriefOut`。
3. `orchestrator._debrief()`：
   - 非入局会话直接 return。
   - `goals = 用户版优先 + infer_all_goals 补齐`（与开庭时一致，取 `case.seat.goals` 即可，T20 已补齐玩家）。
   - 有军师 → 调用；失败或无军师 → `soft_scores=None, custom=None, narrative=None, next_time=[]`，并 `emit("notice", …)`（仅无军师时不发 notice，避免噪音）。
   - `scorecards = {m: build_scorecard(goals[m], verdict, m, soft, custom) for m in 有 goals 的成员}`。
   - `debrief = {"scorecards", "narrative", "next_time", "whatif_recap": whatif(case, player_id), "generated_by"}`；写 `self.s.seat.debrief`；`emit("debrief", debrief)`；`persist_snapshot`。
   - 同时把 `case.seat.strategy.matrix[*].achieved` 填上对应 scorecard（更新内存中的 `self.case.seat.strategy`，随 `case_json` 落库）。
4. `graph_step`：`await self._verdict()` 之后 `await self._debrief()`；幂等（`seat.debrief` 已存在则跳过，续庭安全）。
5. 执行官盲判不受影响：`_debrief` 用军师客户端而不是 `clients[EXECUTOR_ID]`。

## 验收标准

1. 剧本模式入局会话跑完：`debrief` 事件在 `verdict` 之后、`done` 之前；`scorecards` 覆盖全员有诉求者；玩家 `total` 可复算（与 T06 直接计算结果一致）；`narrative is None`。
2. 假军师返回合法 `DebriefOut`：软目标分计入、`narrative` 非空、`next_time` ≤5。
3. 假军师非法两次：记分卡仍产出（软目标 `applicable=False`），有 notice，庭审正常 `done`。
4. 续庭后不重复发 `debrief`。
5. 旁观会话事件序列无 `debrief`；现有测试全过。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_debrief.py; .venv/Scripts/python -m pytest -q
```

## 边界

不做前端；导出在 T30。
