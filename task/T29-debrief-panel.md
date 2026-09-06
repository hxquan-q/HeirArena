# T29 · 前端 DebriefPanel 与矩阵达成列

- 阶段：4 复盘
- 依赖：T28 T27
- 范围：前端新文件 `frontend/src/components/seat/DebriefPanel.tsx`、`frontend/src/components/seat/SeatBriefPanel.tsx`（闭庭后切换内容）、`frontend/src/pages/CourtroomPage.tsx`（闭庭切 Tab）
- 规模：M

## 目标

闭庭后「入局」Tab 顶部显示复盘：我的记分卡（分项 + 达成度 + 公式）、叙事复盘与下一局建议、what-if 对照、全员达成表（矩阵 + "实际达成"列）。

## 设计依据

README「结束与交付」：分项为主、达成度公式公开、软目标由盲判模型引用发言、全员记分卡、叙事只给玩家。

## 现状锚点

- `useCourt.debrief / strategy / seat`（T25）；`Scorecard / ScorecardPart / Debrief / MatrixRow` 类型。
- `VerdictPanel.tsx` 的 `onJumpToTurn`（点 turn_id 跳庭审记录）与 `PixelStatCard` 用法；`CourtroomPage` 中 `jumpToTurn`。
- PxlKit：`PixelStatCard`（总分）、`PixelProgress`（分项）、`PixelBadge`（达成 / 部分 / 未达成 / 红线被破）、`PixelDataTable`（全员达成）、`PixelAccordion`（叙事、建议、公式）、`PixelChip`（turn_id 跳转）。

## 实施步骤

1. `DebriefPanel({ debrief, strategy, seat, agents, caseData, onJumpToTurn })`：
   - 头部：玩家立绘 + `PixelStatCard` 达成度 `total`（`capped` 时红色角标"红线被破，上限 40"）+ 三个徽标（价值份额 / 名义份额 / 法定基线）。
   - 分项：每个 `ScorecardPart` 一行：标签、`PixelProgress value=score/max`、`detail`；`applicable=false` 灰显"未设定"；软目标 / 自定义红线在 `generated_by==="rules"` 时显示"需军师评分"。
   - 公式：`PixelAccordion`「公式」展开 `formula` 文案。
   - 叙事复盘 `narrative`（`PixelTypewriter` 或普通段落）+ 下一局建议列表；引用的 `turn_id` 用 `PixelChip` 可点跳转（正则识别 `[t:xxxx]` 或后端约定的 `turn_ids` 字段）。无军师时显示"接入军师后可得叙事复盘"。
   - what-if 对照：`whatif_recap` 列表（复用 T18 的行样式，只读）。
   - 全员达成：`PixelDataTable`：成员、目标资产（拿到 ✓/✗）、价值份额 vs 最低、红线、达成度；玩家行高亮。数据来自 `debrief.scorecards` 与 `strategy.matrix`。
2. `SeatBriefPanel`：`s.done && s.debrief` 时顶部渲染 `DebriefPanel`，简报折叠到下方。
3. `CourtroomPage`：收到 `debrief` 时切到「入局」Tab 一次（在现有"收到 verdict 切到裁决"之后，以复盘为终点）；Tab 上出现金色圆点提示。

## 验收标准

1. 剧本模式入局会话闭庭后显示记分卡（软目标灰显）、全员达成表；总分与后端一致。
2. 有军师的会话显示叙事与建议，turn_id 可跳转到庭审记录并高亮。
3. 旁观会话不受影响。
4. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不改导出。
