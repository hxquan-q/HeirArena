# T13 · 草稿 store 扩展（席位、诉求、分析缓存）

- 阶段：2 设置页
- 依赖：T12
- 范围：前端 `frontend/src/store/useCaseDraft.ts`、新测试 `frontend/src/store/useCaseDraft.test.ts`
- 规模：M

## 目标

让 `useCaseDraft` 承载入局配置：进入 / 退出入局模式、选席位、编辑任一成员的诉求、缓存确定性分析（`SeatAnalysis`）、保存策略包、席位初值、军师模型。并在成员 / 资产变更时清理失效引用。

## 设计依据

README「入口」「诉求」；`cleanDraft` 是开庭提交的唯一出口；草稿持久化在 `sessionStorage`，`partialize` 只留 `c` 与 `activePreset`。

## 现状锚点

- `frontend/src/store/useCaseDraft.ts`：state `c activePreset preview previewErr`，方法 `upd replace loadPreset applyParsed updAsset updMember addAsset addMember removeAsset removeMember setPreview`，`isDraftValid`、`cleanDraft`、`useLegalPreview`（350ms 防抖 + `AbortController`）。
- `frontend/src/data/presets.ts`：`newMember()`、`PRESETS[].build()`。

## 实施步骤

1. state 新增：`analysis: SeatAnalysis | null`、`analysisErr: string | null`、`analyzing: boolean`、`strategizing: boolean`、`strategyErr: string | null`、`advisorModel: ModelRef | null`（草稿级，旁观时也可设，进入入局时同步到 `c.seat.advisor_model`）。`partialize` 追加 `advisorModel`；`analysis` 不持久化。
2. 方法：
   - `enterSeat(playerId)`：`c.seat = { player_id, goals: { [playerId]: goalsFromWish(member) }, seat_human: false, advisor_model: advisorModel, strategy: null }`；`goalsFromWish` 用 `wish` 作 `narrative`，并按资产名 / 类型关键词命中填 `target_assets`（关键词表复制 `presets.ts` 现有 `ASSET_TYPES` 标签 + 资产名包含匹配），`source: 'user'`。
   - `leaveSeat()`：`c.seat = null`，清 `analysis / strategy`。
   - `setPlayer(playerId)`：改 `player_id`，原玩家 goals 保留但 `source` 保持；新玩家若无 goals 则 `goalsFromWish`。
   - `updGoals(memberId, patch)`：合并并置 `source: 'user'`；`resetGoals(memberId)`：删除该成员 goals（下次 analysis 会带回推断版）。
   - `applyInferred(inferred: Record<string, Goals>)`：对没有 `source: 'user'` 的成员写入推断版。
   - `setSeatHuman(bool)`、`setAdvisorModel(ref)`（同步到 `c.seat.advisor_model`）、`setStrategy(pack | null)`、`setAnalysis / setAnalysisErr / setAnalyzing / setStrategizing / setStrategyErr`。
   - `removeMember / removeAsset / updMember(relation 变更)` 后调用内部 `pruneSeat()`：玩家被删或变成宠物 / AI / 已故 → `leaveSeat()`；goals 中失效的 asset / member 引用剔除；`strategy` 置 null（案情变了策略就过期）。`updAsset / updMember / addMember / addAsset` 也把 `strategy` 置 null。
3. `applyParsed(result)`：保留 `seat`（若玩家 id 仍存在于新成员里，否则 `leaveSeat`）。实际导入回填会换一套成员 id，所以通常结果是 `leaveSeat()`；T21 会在回填后立刻 `enterSeat`。
4. `isDraftValid(c)`：`c.seat` 非空时要求 `player_id` 有效且对应成员非宠物非 AI 非已故。
5. `cleanDraft(c)`：过滤无名成员 / 资产后同步 `pruneSeat` 的逻辑；`seat` 存在时保证 `goals` 只含现存成员。
6. 新增 hook `useSeatAnalysis()`：`c.seat` 非空且 `player_id` 有效时，对 `c`（去掉 `strategy` 以减小载荷）350ms 防抖调用 `api.seatAnalyze`，成功后 `setAnalysis` 并 `applyInferred(analysis.inferred_goals)`；用 `AbortController` 取消旧请求；错误保留旧 analysis 并写 `analysisErr`。旁观模式不请求。
7. vitest 单测：`enterSeat/leaveSeat/setPlayer/updGoals/pruneSeat/isDraftValid/cleanDraft` 的行为。

## 验收标准

1. 删除玩家成员后 `c.seat === null`；删除某资产后所有 goals 的 `target_assets / red_lines / soft_goals` 不再引用它。
2. `updGoals` 后 `source === 'user'`；`applyInferred` 不覆盖 `user` 版本。
3. `cleanDraft` 输出通过后端 `CaseInput` 校验（在测试中用 T01 的规则做等价断言：无失效引用）。
4. 旁观模式下 `useSeatAnalysis` 不发请求（mock `api.seatAnalyze` 断言未调用）。
5. `npm run build`、`npm test` 通过。

## 验证命令

```powershell
cd frontend; npm test; npm run build
```

## 边界

不改页面 UI；不改后端。
