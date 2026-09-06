# T12 · 前端类型与 API 客户端、SSE 事件枚举

- 阶段：2 设置页
- 依赖：T01（后端 Schema 已定）
- 范围：前端 `frontend/src/types.ts`、`frontend/src/api/client.ts`
- 规模：S

## 目标

把 T01 的全部数据结构镜像为 TS 类型，`CaseInput` 增加 `seat`，API 客户端增加席位相关方法，SSE 事件封闭枚举补上四个新事件。之后所有前端任务只依赖这里的类型。

## 设计依据

README「技术约定」TS 严格类型；SSE 事件是前端封闭枚举，`client.ts` 按枚举逐个 `addEventListener`。

## 现状锚点

- `frontend/src/types.ts`：`Member CaseInput AgentSpec Turn TurnMeta Verdict` 等；`Admission` 类型。
- `frontend/src/api/client.ts`：`api` 对象（`config providers … legalPreview parseCase createSession interject pause resume exportUrl`）、`SSE_EVENTS` 常量与 `SseEventType`、`subscribe(sessionId, handle, onClose)`。

## 实施步骤

1. `types.ts` 新增并导出：`RedLineKind RedLine SoftGoalKind SoftGoal Goals BriefItem Brief WhatIfDelta Reachability CoalitionRow AssetCompetitionRow PayoffRow GameTables ScorecardPart Scorecard MatrixRow StrategyPack SeatConfig SeatAnalysis`，字段名、可空性与 T01 一致（`float|None` → `number | null`，`dict` → `Record`）。`CaseInput` 增加 `seat: SeatConfig | null`。
2. 新增庭审运行态类型：`SpeechCard { id; title; text; responds_to: string | null; action: Action; claims: Record<string, number>; suggests_admission: Admission | null; serves: string[]; risk_note: string }`、`AwaitingInfo { turn_key: string; phase: Phase; round: number; attacked_by: string | null; cards_pending: boolean }`、`Debrief { scorecards: Record<string, Scorecard>; narrative: string | null; next_time: string[]; whatif_recap: WhatIfDelta[]; generated_by: string }`、`PlayerSpeech { text: string; meta: { action?: Action; target?: string | null; claims?: Record<string, number>; admissions: Admission[] } }`。
3. `client.ts`：
   - `SSE_EVENTS` 追加 `'seat' | 'awaiting_player' | 'cards' | 'debrief'`。
   - `api.seatAnalyze(c: CaseInput, signal?: AbortSignal): Promise<SeatAnalysis>` → `POST /api/seat/analyze`。
   - `api.seatStrategy(c: CaseInput): Promise<StrategyPack>` → `POST /api/seat/strategy`。
   - `api.setSeat(id, human: boolean)` → `PUT /api/sessions/{id}/seat`。
   - `api.speak(id, body: PlayerSpeech | { delegate: true })` → `POST /api/sessions/{id}/speak`。
   - `api.regenerateCards(id)` → `POST /api/sessions/{id}/cards`。
   - 错误处理沿用文件内现有的 `request()`/`json()` 帮助函数与中文错误信息约定。
4. 不改任何页面。

## 验收标准

1. `npm run build` 通过（新类型未被使用也不能有 unused 报错——若 `tsc` 配置 `noUnusedLocals` 报错，导出即可）。
2. `SSE_EVENTS.length === 19`。
3. 与 `backend/app/models.py` 对照，每个新模型字段一一对应（手动核对并在 PR 描述里列出对照表）。

## 验证命令

```powershell
cd frontend; npm run build; npm test
```

## 边界

不改 store、不改页面。
