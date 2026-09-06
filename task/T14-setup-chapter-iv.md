# T14 · 第 IV 卷「入局」骨架、模式切换、开庭按钮迁移

- 阶段：2 设置页
- 依赖：T13
- 范围：前端 `frontend/src/pages/SetupPage.tsx`、新目录 `frontend/src/components/seat/`（本任务只建 `SeatChapter.tsx` 骨架）
- 规模：M

## 目标

设置页从三卷变四卷。第 IV 卷「入局」承载模式切换（旁观全员 / 入局推演），默认旁观时只显示模式切换与「开庭」；切到入局后显示后续任务要填充的区块占位。「开庭」按钮从第 III 卷迁到第 IV 卷。

## 设计依据

README「入口」；PxlKit 组件；两字节奏卷名。

## 现状锚点

- `frontend/src/pages/SetupPage.tsx`：`CHAPTERS`（`file / assets / roster`，`roman I~III`）、`renderFile / renderAssets / renderRoster`、`isLast = step === CHAPTERS.length - 1`、底部导航按钮与 `<CourtRecord onStart={start} …>`、`start()` 调 `api.createSession(cleanDraft(c))`、`valid = isDraftValid(c)`。
- `frontend/src/components/ui/CourtRecord.tsx`：右侧卷宗卡，含 `onStart`。
- 现有卷内区块标题组件 `PanelHeading`（文件内定义）。

## 实施步骤

1. `CHAPTERS` 追加 `{ id: 'seat', roman: 'IV', label: '入局', title: '选择席位与诉求', desc: '我是谁 · 诉求 · 策略', accent: '#a58bff', icon: <Target size={15} /> }`（图标用 lucide `Target` 或 PxlKit `@pxlkit/gamification` 的 `Target`，与文件内现有图标来源保持一致）。
2. 新建 `components/seat/SeatChapter.tsx`，props 只从 `useCaseDraft` 取，内部结构：
   - 顶部 `PixelSegmented`（tone gold）：`旁观全员 | 入局推演`，值由 `c.seat === null` 推导；切到入局时若无玩家 → 先渲染席位选择占位（T15 填充），`enterSeat` 在选中成员时调用；切回旁观 → `leaveSeat()`（有策略包时用 `PixelAlertDialog`/`PixelModal` 确认"会丢弃已生成的策略"）。
   - 入局模式下的区块槽位（先放 `PixelEmptyState` 占位，标注后续任务号）：席位选择（T15）、我的诉求（T16）、对手诉求（T17）、what-if 沙盘（T18）、推演策略（T19）、席位初值与军师（T20）。
   - 一段说明文案（`panel-inset`）：入局模式关闭幽灵插话；对手也会按自己的最优策略行动；执行官不知道谁是玩家。
3. `SetupPage`：`renderSeat = () => <SeatChapter />`；`isLast` 逻辑自然变为第 IV 卷；`CourtRecord` 的 `onStart` 与底部「开庭」按钮只在 `isLast` 时可见（现状已如此），确认第 III 卷不再显示开庭按钮；`valid` 采用 T13 更新后的 `isDraftValid`。
4. 顶部进度条（`nav aria-label="案卷进度"`）自动多一格，检查移动端宽度下四格不溢出（`no-scrollbar overflow-x-auto` 已有）。

## 验收标准

1. 预设案件进入设置页可看到四卷；第 IV 卷默认显示「旁观全员」与「开庭」，点击开庭行为与改动前一致（请求体无 `seat` 字段或为 `null`）。
2. 切到「入局推演」后显示六个占位区块；切回旁观后 `c.seat === null`。
3. 有 `strategy` 时切回旁观弹确认框。
4. `npm run build` 通过；`oxlint` 无新增告警。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不实现任何占位区块的内容；不改后端。
