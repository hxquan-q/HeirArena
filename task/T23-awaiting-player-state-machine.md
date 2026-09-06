# T23 · 等待玩家状态机（interrupt / speak / delegate / 重启）

- 阶段：3 庭审
- 依赖：T22
- 范围：后端 `backend/app/agents/orchestrator.py`（`_debater_turn`、`run`）、`backend/app/main.py`（`/speak`、`/seat` 的 delegate 补全）、新测试 `backend/tests/test_seat_turn.py`
- 规模：L

## 目标

轮到玩家且席位为"人"时，庭审在该发言人处挂起并发出 `awaiting_player`；玩家通过 `/speak` 提交正文与表单 meta（或 `delegate`），庭审从检查点续跑，把玩家的话作为一个正常 `Turn` 逐字回放进庭审记录。刷新页面、重启服务都停在等待处。这是本功能唯一改动庭审时序的任务。

## 设计依据

README「庭审交互」；不变量 2、5；技术取舍"等待玩家是独立状态、幂等重执行"。

## 现状锚点

- `court_graph.py`：单节点 `advance` 自循环；`_maybe_pause` 在节点入口用 `interrupt({...})`；`route`；`graph_config` 的 `recursion_limit` 按发言数预算。
- `orchestrator.py`：`graph_step`（每步推进一位发言人，幂等靠 `_already_spoke`）；`_debater_turn(m, phase, round_no, focus)`（先 `_status thinking`、`_drain_interjections`、`attacked_by = last_attacker.pop`、构造 mock 台词与 meta，再走 LLM 或 mock 流）；`_speak(agent_id, phase, round_no, gen, expect_meta, meta_override)`；`_normalize_meta`；`_after_speech`；`run(resume)`：有 interrupts 且未 paused 时 `graph.ainvoke(Command(resume=True), config)`。
- LangGraph 语义：`interrupt(payload)` 抛出中断；`Command(resume=value)` 续跑时**节点从头重执行**，此时 `interrupt()` 直接返回 `value`。因此 `interrupt()` 之前的所有副作用都必须幂等。

## 实施步骤

1. `orchestrator.py`：
   - `_human_turn(m) -> bool`：`self.s.seat is not None and m.id == self.player_id and self.s.seat.human`。
   - 在 `_debater_turn` 最前面加玩家分支：

```python
if self._human_turn(m):
    key = f"{phase}:{round_no}:{m.id}"
    payload = await self._await_player(m, phase, round_no, focus, key)   # 可能抛 GraphInterrupt
    if not payload.get("delegate"):
        await self._speak_player(m, phase, round_no, payload)
        return
    # delegate：清掉等待态后落入原有 AI 路径
```

   - `_await_player`：① 若 `self.s.seat.pending` 的 `turn_key == key` → 直接返回它并清空（重启后经 `/speak` 续跑的情形）；② 幂等地准备等待态：`attacked_by = self.last_attacker.get(m.id)`（不 pop，AI 路径才 pop）；若 `seat.awaiting` 不是这个 key → 写入 `awaiting = {turn_key, phase, round, attacked_by, focus, emitted: False}`；③ 发言卡：`if key not in seat.cards` → 调 T24 的 `generate_cards`（本任务先留 hook：`await self._cards_for(key, m, phase, round_no, focus)` 默认返回 `[]`）并 `emit("cards", …)`（一次）；④ 若 `not awaiting["emitted"]` → `emit("awaiting_player", {turn_key, phase, round, attacked_by, focus, cards_pending: False})`，`_status(m.id, "thinking")`，`awaiting["emitted"]=True`，`s.status="awaiting_player"`，`persist_snapshot`；⑤ `resume = interrupt({"reason": "awaiting_player", "turn_key": key})`；⑥ 返回 `resume`（续跑时得到 `/speak` 传入的 payload），并把 `seat.awaiting = None`、`s.status = "running"`。
   - `_speak_player`：`meta = self._normalize_meta(m.id, payload["meta"])`（`admissions` 只取表单值——`_normalize_meta` 已做白名单）；`text = payload["text"][:500]`；`turn = await self._speak(m.id, phase, round_no, self._mock_stream(text), expect_meta=False, meta_override=meta)`；`await self._after_speech(turn)`；`self.last_attacker.pop(m.id, None)`。
   - `run(resume=True)`：有 interrupts 时，若 `s.seat and s.seat.pending` → `Command(resume=s.seat.pending)`；否则维持 `Command(resume=True)`（休庭续庭）。若 `s.status == "awaiting_player"` 且没有 pending → 直接 return（不得让 AI 替说）。
2. `main.py`：
   - `POST /api/sessions/{id}/speak` body `{text?: str(≤500), meta?: {action?, target?, claims?, admissions?: list[str]}, delegate?: bool}`：会话须为入局且 `status == "awaiting_player"`，否则 409；`delegate` 与 `text` 二选一，`text` 去空白后 ≥1 字；写 `s.seat.pending = {"turn_key": s.seat.awaiting["turn_key"], ...}`；`s.status = "running"`；`persist_snapshot`；`_spawn(orch, resume=True)`；返回 `{"ok": true}`。meta 抽取（T24）在此之前调用，本任务先直接使用表单 meta（默认 `action="propose"`）。
   - `PUT /seat` 的 `human=False` 且 `awaiting` 时：等价于 `speak(delegate=True)`。
3. 重启语义：`_setup_runtime` 对 `awaiting_player` 只重建不 spawn（T22 已做）；`/speak` 走 `_get` 重建后续跑。

## 验收标准（全部用剧本模式，无需模型）

1. 入局会话、席位为人：庭审推进到玩家的陈述回合时发出 `awaiting_player`，`status == "awaiting_player"`，之后 3 秒内没有新的 `speech_start`（用事件序列断言）。
2. `/speak {text, meta:{action:"attack", target:儿子, admissions:["waive_share"]}}` 后：出现玩家的 `speech_start/delta/end`，`meta.admissions == ["waive_share"]`，`_after_speech` 产生 `relation` 事件；庭审继续到下一位；最终 `verdict.established_facts` 含该 `waive_share`。
3. `/speak {delegate: true}`：玩家的发言由 AI（剧本）路径产生，`meta_override` 来自 `mock_speech`。
4. 等待中：`/pause` 409、`/interject` 409、再次 `/speak` 成功后第三次 `/speak` 409。
5. 重启模拟：在 `awaiting_player` 时 `rebuild_session + rebuild_orchestrator + run(resume=True)` 不产生任何新发言、状态仍为 `awaiting_player`；随后 `/speak` 正常续跑。
6. 幂等：续跑重执行时 `awaiting_player` 与 `cards` 事件各只出现一次（按 `turn_key` 计数）。
7. 旁观会话与"席位为 AI"的入局会话：`test_orchestrator_mock.py`、`test_court_persist.py` 全过，事件序列中没有 `awaiting_player`。
8. `graph_config` 的步数预算无需改动（interrupt 重执行不额外消耗 superstep）——在 4 轮 12 角色 + 玩家多次发言的用例上跑通到 `done`。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_turn.py; .venv/Scripts/python -m pytest -q
```

## 边界

不生成发言卡内容、不做 LLM meta 抽取（T24）；不做前端。
