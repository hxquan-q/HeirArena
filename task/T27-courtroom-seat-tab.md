# T27 · 庭审页：「入局」Tab（简报 + 发言卡）

- 阶段：3 庭审
- 依赖：T26 T24
- 范围：前端 `frontend/src/pages/CourtroomPage.tsx`（TABS）、新文件 `frontend/src/components/seat/SeatBriefPanel.tsx`、`frontend/src/components/seat/SpeechCards.tsx`
- 规模：M

## 目标

右栏新增「入局」Tab：常驻我的简报（七节可折叠，只显示启用条目）、当前席位状态、轮到我时的发言卡列表（点卡填入草稿、「重新起草」）。发言卡同时以紧凑芯片形式出现在 `SeatDock` 的槽位里。

## 设计依据

README「庭审交互」发言卡内容与"永不自动勾选自认"；「庭审中不放 what-if」。

## 现状锚点

- `CourtroomPage.tsx`：`TABS` 常量（`transcript / graph / legal / verdict`）与 tab 按钮渲染、`tab === …` 分发；收到 verdict 自动切 tab 的 effect。
- `useCourt`：`strategy.briefs[seat.playerId]`、`cards / cardsPending / awaiting`（T25）；`api.regenerateCards`（T12）。
- `SeatDock` 的 `cardsSlot`（T26）。
- PxlKit：`PixelAccordion`、`PixelCard`、`PixelChip`、`PixelBadge`、`PixelSkeleton`、`PixelButton`。

## 实施步骤

1. `TABS` 在 `s.seat` 存在时插入 `{ id: 'seat', label: '入局', icon: Target }`（放在「庭审记录」之后）；旁观会话不出现。等待开始时自动切到「入局」Tab 一次（用 ref 防止反复切换）。
2. `SeatBriefPanel`：
   - 顶部：玩家立绘 + 名字 + 「本席由 我/AI 发言」+ `generated_by` 徽标；无 `strategy` 时 `PixelAlert`"开庭前未推演策略，AI 代理仅按人设与心愿发言"。
   - 七节 `PixelAccordion`（默认展开⑤⑦），只渲染 `enabled` 条目；条目的法条 / Δ% / 置信度小字。
   - 发言卡区（等待态）：`cardsPending` → `PixelSkeleton` ×3 + "军师起草中"；`cards` → `SpeechCards`；空数组且非 pending → "未接入军师，自由发挥吧"。
3. `SpeechCards({ cards, onUse, onRegenerate })`：每张 `PixelCard`：标题、正文（可展开全文）、`PixelChip` 回应对象、`serves` 对应的简报条目标题、`risk_note`（红字）、`suggests_admission` 时 `PixelBadge tone="red"`"建议确认 X 的扶养 / 建议放弃部分份额——需你在输入区手动勾选"；「用这张」→ `onUse(card)` 把 `text` 填入 `SeatDock` 文本框、动作 / 目标 / 诉求芯片按卡预填，**自认复选框保持不动**；「重新起草」→ `api.regenerateCards`。
4. `SeatDock.cardsSlot`：渲染同一组卡的紧凑版（仅标题，点选即填入）。共享草稿状态：把 `SeatDock` 的草稿提升到 `CourtroomPage`（`useState`）或一个小 zustand slice `useSeatDraft`，供两处读写。

## 验收标准

1. 入局会话右栏出现「入局」Tab；旁观会话没有。
2. 等待态收到 `cards` 后 Tab 与 Dock 都显示 3 张卡；「用这张」后文本框内容等于卡片正文，自认复选框未被勾选；即便卡片 `suggests_admission` 非空也不勾选。
3. 「重新起草」触发请求并刷新卡片。
4. 简报只显示启用条目，与设置页编辑结果一致。
5. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不做复盘面板（T29）。
