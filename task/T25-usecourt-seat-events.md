# T25 · 前端 `useCourt` 新事件与状态

- 阶段：3 庭审
- 依赖：T12
- 范围：前端 `frontend/src/store/useCourt.ts`、`frontend/src/store/useCourt.test.ts`
- 规模：S

## 目标

让庭审 store 理解 `seat / awaiting_player / cards / debrief` 四个事件，并从 `session_start` 里读出席位信息与策略包；刷新页面时通过事件回放自然恢复"正在等我发言"的状态。

## 设计依据

README「庭审交互」等待落库、刷新恢复；SSE 事件封闭枚举。

## 现状锚点

- `useCourt.ts`：`CourtState` 字段与 `initial`；`connect` 的 `switch(type)`；`session_start` 读 `d.case / d.agents / d.legal`；`speech_start/speech_end` 维护 `turns / activeTurnId`；`sfx` 调用。
- `frontend/src/store/useCourt.test.ts` 现有测试写法（如何构造事件并断言 state）。
- 类型 `SeatConfig StrategyPack SpeechCard AwaitingInfo Debrief`（T12）。

## 实施步骤

1. state 新增：`seat: { playerId: string; human: boolean } | null`、`strategy: StrategyPack | null`、`awaiting: AwaitingInfo | null`、`cards: SpeechCard[]`、`cardsPending: boolean`、`debrief: Debrief | null`；`initial` 对应默认值；`reset` 清理。
2. 事件处理：
   - `session_start`：`seat = d.seat ? { playerId: d.seat.player_id, human: d.seat.seat_human } : null`；`strategy = (d.case as CaseInput).seat?.strategy ?? null`。
   - `seat`：`human` 更新；若 `awaiting` 且 `human === false` → 清 `awaiting / cards`（后端已 delegate）。
   - `awaiting_player`：`awaiting = {...}`，`cardsPending = d.cards_pending`，`sfx('phase')`（或新增 `sfx('bell')`，若 `lib/sfx.ts` 无对应音效则复用 `ghost`）。
   - `cards`：`cards = d.cards`，`cardsPending = false`。
   - `speech_start`：若 `awaiting && d.agent_id === seat.playerId` → 清 `awaiting / cards`（玩家已开口，等待结束）。
   - `debrief`：`debrief = d`。
3. 派生 selector：`selectIsMyTurn = s => !!s.awaiting`、`selectMe = s => s.agents.find(a => a.id === s.seat?.playerId)`。
4. 测试：回放 `session_start(含 seat) → … → awaiting_player → cards → speech_start(玩家)` 断言状态流转；`seat(human=false)` 在等待中清空等待；旁观会话 `seat === null` 且新事件不触发异常。

## 验收标准

1. 上述测试通过；`npm run build` 通过。
2. 旁观会话的所有既有测试不变。

## 验证命令

```powershell
cd frontend; npm test; npm run build
```

## 边界

不改页面。
