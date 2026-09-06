# T26 · 庭审页：席位开关、等待横幅、发言输入区

- 阶段：3 庭审
- 依赖：T25 T23
- 范围：前端 `frontend/src/pages/CourtroomPage.tsx`、新文件 `frontend/src/components/seat/SeatDock.tsx`、`frontend/src/components/seat/SeatToggle.tsx`
- 规模：L

## 目标

入局会话的庭审页：顶栏多一个「本席：我 / AI」开关；轮到我时中栏出现等待横幅与发言输入区（正文 ≤500 字、动作 / 目标 / 资产诉求芯片、自认勾选与后果提示、「发言」「改由 AI 代说」）；显灵行动栏在入局会话中隐藏；证据宝箱保留只读。

## 设计依据

README「庭审交互」全部条目；「入局模式关闭幽灵插话」；自认后果文案与 `_fact_based_plan` 步长一致（承认未尽义务 −3、放弃份额 −3、确认他人扶养：被两人以上确认对方 +2）。

## 现状锚点

- `CourtroomPage.tsx`：顶栏右侧按钮组（`休庭/续庭` chip、连接状态 chip）；中栏 `<ActionBar …/>`（显灵行动栏）位置；`EvidenceDrawer` 的 `pickMode` 仅由 ActionBar 触发；`useArena` 的 `bind/regen` 可保留。
- `useCourt`：`seat / awaiting / cards / cardsPending`（T25）；`api.setSeat / api.speak`（T12）。
- 现有输入区样式：`ActionBar` 底部"自由低语"一行（`border-2 border-ink-600 bg-ink-950 …`）。
- PxlKit：`PixelSwitch`（席位）、`PixelAlert`（等待横幅）、`PixelTextarea`、`PixelChip`/`PixelSelect`（动作与目标）、`PixelCheckbox` + `PixelTooltip`（自认）、`PixelButton`。

## 实施步骤

1. `SeatToggle`（顶栏，仅 `s.seat` 存在且未闭庭）：`PixelSwitch` 标签「本席由我发言」，值 `s.seat.human`，切换调 `api.setSeat`；等待中切到 AI 时先 `PixelAlertDialog` 确认"这一轮会由 AI 代说"。
2. `SeatDock`（中栏，替换 `ActionBar` 的位置；`s.seat` 为 null 时仍渲染原 `ActionBar`）：
   - 非等待态：一行状态"本席由 {我 / AI 代理} 发言 · 你的席位：{玩家名}"+ 简报入口按钮（切到「入局」Tab，T27）。
   - 等待态：`PixelAlert tone="gold"` 横幅"轮到你了 · {阶段/轮次}{焦点}"，若 `attacked_by` → "{名字} 刚点名针对了你，先正面回应"。
   - 输入区：`PixelTextarea`（`maxLength=500`，计数）；发言卡芯片槽（T27 填充，这里留 `cardsSlot` prop）；动作 `PixelSegmented`（攻击 / 结盟 / 提案 / 让步 / 恳求，默认"提案"，可留空让军师抽取——提供「由军师判断」选项）；目标 `PixelSelect`（出席者，可空）；资产诉求：每项资产一个小数字输入（%，可空）；**自认区**：三个 `PixelCheckbox`：「我承认有能力却未尽扶养义务（第1130条，−3 个百分点）」「我放弃一部分应得份额（第1132条，−3 个百分点）」「我确认 [成员选择] 尽了主要扶养义务（第1130条，被两人以上确认后对方 +2）」，每个带 `PixelTooltip` 解释；勾选任一自认时文本框上方出现红色提示"这会直接改变份额，确定吗"。
   - 按钮：「发言」（`btn-gold`，正文非空可用）→ `api.speak(id, {text, meta:{action?, target?, claims?, admissions}})`；「改由 AI 代说」（`btn-ghost`）→ `api.speak(id, {delegate:true})`；发送中禁用；失败 toast。
   - 让步动作（`concede`）与协商阶段：提示"协商阶段选择让步会被记为主动让步（−1.5）"。
3. `CourtroomPage`：`s.seat ? <SeatDock …/> : <ActionBar …/>`；顶栏插入 `SeatToggle`；连接状态 chip 在等待时显示「等你发言」；`EvidenceDrawer` 的 `pickMode` 在入局会话恒为 false。
4. 音效：进入等待 `sfx('ghost')` 或新增；发送成功 `sfx('confirm')`。

## 验收标准

1. 旁观会话页面与改动前一致（仍显示显灵行动栏，无席位开关）。
2. 入局会话：顶栏有席位开关；轮到我时出现横幅与输入区；发送后输入区消失、庭审记录里出现我的发言、meta 与勾选一致。
3. 未勾选任何自认时请求体 `admissions: []`；勾选"放弃份额"时 `admissions: ["waive_share"]`。
4. 「改由 AI 代说」后 AI 发言出现，等待态清空。
5. 刷新页面回到等待态（事件回放）。
6. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

发言卡的渲染与「入局」Tab 在 T27。
