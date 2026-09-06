# T22 · 会话运行态、席位接口、409 规则、持久化与恢复

- 阶段：3 庭审
- 依赖：T11
- 范围：后端 `backend/app/agents/orchestrator.py`（`Session`、`_extras`）、`backend/app/agents/restore.py`、`backend/app/persist.py`（`list_resumable_case_ids`）、`backend/app/main.py`（`/seat`、`/interject`、`/pause`）、新测试 `backend/tests/test_seat_runtime.py`
- 规模：M

## 目标

给会话加上入局运行态（席位开关、等待中的回合、已发的卡、待续跑的发言、复盘），随 `extras` 落库并在重启后恢复；提供 `PUT /api/sessions/{id}/seat`；入局会话的 `/interject` 返回 409；等待玩家时 `/pause` 返回 409。为 T23 的状态机铺好地基，本任务不做 `interrupt`。

## 设计依据

README「庭审交互」（随时可切、等待落库、重启不自动续跑、幽灵关闭）；不变量 4、5。

## 现状锚点

- `orchestrator.py`：`Session` dataclass（`status paused interjections …`）、`Orchestrator._extras()`（8 个键：`interjections claims relations stats last_attacker prefs paused focus_issues`）、`Session.emit`。
- `restore.py`：`rebuild_session`（恢复 `status/created_at/events/interjections/claims/relations/paused/verdict/transcript`）、`rebuild_orchestrator(session, extras)`（`last_attacker prefs stats focus_issues`）。
- `persist.py`：`list_resumable_case_ids()` 只取 `status in ["running","paused"]`；`update_status`、`upsert_case` 整体覆盖 `extras_json`。
- `main.py`：`_setup_runtime` 对 `status == "running" and not paused` 的会话 `_spawn(resume=True)`；`interject`（`status != "running"` → 409）；`pause_session`；`_get`。

## 实施步骤

1. `orchestrator.py` 新增：

```python
@dataclass
class SeatRuntime:
    human: bool = False
    awaiting: dict | None = None      # {"turn_key","phase","round","attacked_by","emitted": bool}
    cards: dict[str, list[dict]] = field(default_factory=dict)   # turn_key -> cards
    pending: dict | None = None       # {"turn_key", "text","meta"} 或 {"turn_key","delegate": True}
    debrief: dict | None = None
```

   `Session.seat: SeatRuntime | None`，`build_session` 中 `case.seat` 非空时初始化为 `SeatRuntime(human=case.seat.seat_human)`。
2. `_extras()` 增加键 `"seat": asdict(self.s.seat) if self.s.seat else None`；`restore.rebuild_session` 恢复 `session.seat`（`SeatRuntime(**extras["seat"])`）。
3. `Orchestrator` 属性 `player_id`（`case.seat.player_id` 或 None）、`is_seat_session`。
4. `persist.list_resumable_case_ids` 纳入 `"awaiting_player"`；`_setup_runtime` 保持只对 `running` 自动续跑（`awaiting_player` 的会话只重建进内存，不 spawn）。
5. `main.py`：
   - `PUT /api/sessions/{id}/seat` body `{human: bool}`：非入局会话 404；已结束 409；写 `s.seat.human`，`emit("seat", {"human": …})`，`persist_snapshot`。**若当前 `s.status == "awaiting_player"` 且 `human=False`**：交给 T23 的 delegate 路径（本任务先返回 `{"ok": true, "human": false, "awaiting": true}` 并在 T23 中补全续跑）。
   - `/interject`：`s.seat is not None` → 409 "入局推演模式下逝者不能显灵——这是当事人视角的沙盘"。
   - `/pause`：`s.status == "awaiting_player"` → 409 "正在等你发言，无需休庭"。
6. `Session.status` 允许值文档化：`running / paused / awaiting_player / done / cancelled / error`；SSE `/stream` 关闭条件不变。

## 验收标准

1. 入局会话创建后 `extras["seat"]["human"]` 等于开庭时的初值；`PUT /seat` 后 SSE 收到 `seat` 事件且 `extras` 更新。
2. 重建（`rebuild_session`）后 `session.seat` 与落库一致；旁观会话 `extras["seat"] is None` 且 `session.seat is None`。
3. 入局会话 `/interject` → 409；旁观会话行为不变（现有测试通过）。
4. `status="awaiting_player"` 的会话出现在 `list_resumable_case_ids`，但 `_setup_runtime` 不为其 spawn（用可注入的 `_spawn` 断言）。
5. `_extras()` 对旁观会话新增的 `seat: None` 不影响 `test_court_persist.py`。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_runtime.py; .venv/Scripts/python -m pytest -q
```

## 边界

不实现 `interrupt`、`/speak`、`/cards`（T23、T24）。
