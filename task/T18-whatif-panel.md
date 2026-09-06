# T18 · what-if 沙盘面板与举证清单

- 阶段：2 设置页
- 依赖：T15
- 范围：前端新文件 `frontend/src/components/seat/WhatIfPanel.tsx`，接入 `SeatChapter.tsx`
- 规模：M

## 目标

第 IV 卷里的事实沙盘：列出后端算出的每个可切换事实（我方有利、对方不利、夫妻共同财产标记），每个开关旁标注对我法定份额的差分与"需要什么证据"；用户可以同时打开多个开关，面板用 `/api/legal/preview` 对**副本**实时重算全员份额，不改草稿本身。

## 设计依据

README「杠杆边界」：事实层靠 what-if 沙盘，含夫妻共同财产标记，估值不切换；举证清单来自静态表。

## 现状锚点

- `useCaseDraft`：`analysis.whatif`（`WhatIfDelta[]`，`key` 形如 `main_support:m_x` / `neglect:m_y` / `joint:a_house`）、`analysis.evidence_checklist`、`preview`（当前法定份额）。
- `api.legalPreview(case, signal)`（已有，350ms 防抖模式见 `useLegalPreview`）。
- `frontend/src/components/ui/CourtRecord.tsx` 的 `ShareBar`（份额条，可复用来显示"当前 vs 沙盘"两组）。
- PxlKit：`PixelSwitch`、`PixelChip`、`PixelTooltip`、`PixelBarChart`（可选，用于差分柱）。

## 实施步骤

1. `WhatIfPanel`：
   - 三个分组标题：「我能证明的（有利）」「对方可能证明的（不利）」「财产权属」；每条 = `PixelSwitch`（默认关） + `label` + 差分徽标（`+3.2%` 绿 / `−4.1%` 红，来自 `delta_pct`）+ 法条 chip + 「证据」按钮（`PixelTooltip` 或点开 `PixelDrawer` 列出 `evidence[]` 与举证提示）。
   - 组合模式：把所有打开的开关应用到 `structuredClone(cleanDraft(c))`（按 `key` 解析：成员布尔位或资产 `joint` 翻转），350ms 防抖调 `api.legalPreview`，结果用两组 `ShareBar` 对照显示"当前法定 vs 沙盘"，并单独放大玩家的两个数字。
   - 顶部一句提示："这里只是推演，不会改变卷宗。要让某个事实真正进入案情，请回第 III 卷勾选并准备对应证据。"
   - 底部「举证清单」：按玩家身份列出 `evidence_checklist` 中相关杠杆（来自 `hints_for_member` 的结果）的证据类型与举证责任。
2. 接入 `SeatChapter`「what-if 沙盘」槽位。无 `analysis` 时 `PixelSkeleton`。

## 验收标准

1. 打开"证明 周晓 尽了主要扶养义务"后沙盘份额变化与开关徽标一致（差分 = 单开关时的差）；草稿 `c` 未被修改（切回其他卷数据不变）。
2. 同时打开多个开关会发起一次合并请求（防抖），旧请求被取消。
3. 每个开关都有至少 3 条证据类型可见。
4. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不改后端；庭审页不放此面板（README 决策）。
