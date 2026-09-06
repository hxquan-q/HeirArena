# T16 · 我的诉求表单

- 阶段：2 设置页
- 依赖：T15
- 范围：前端新文件 `frontend/src/components/seat/GoalsForm.tsx`（通用，T17 复用）、接入 `SeatChapter.tsx`
- 规模：L

## 目标

结构化 + 自由文本地编辑一份 `Goals`：可排序的目标资产、最低可接受价值份额（带可达性非阻断警告）、模板化红线 + 自由文本、枚举软目标 + 自由文本、给代理演的自由文本。组件以 `memberId` 为参数，T17 对手诉求直接复用。

## 设计依据

README「诉求」全部条目；「达成度公式」决定字段语义（目标资产按排序加权、最低份额是价值份额口径）。

## 现状锚点

- `useCaseDraft`：`c.seat.goals[memberId]`、`updGoals(memberId, patch)`、`analysis.reachability / warnings`（T13）。
- PxlKit：`PixelChipGroup / PixelChip`（已排序目标资产）、`PixelIconButton`（上移 / 下移 / 删除）、`PixelSelect` 或 `PixelCombobox`（选资产 / 成员）、`PixelNumberInput`（最低份额）、`PixelTextarea`（自由文本）、`PixelAlert`（警告）、`PixelTooltip`（字段说明）、`PixelSwitch`。用前查 `dist/index.d.ts` 的 props。
- 资产 emoji：`frontend/src/data/presets.ts` `ASSET_EMOJI`；关系标签 `RELATION_LABEL`。

## 实施步骤

1. `GoalsForm({ memberId, compact? })`：
   - **目标资产**：已选列表（有序，最多 5），每项显示 emoji + 名称 + 排位徽标（1st 60% / 2nd 30% / 3rd 10% 的权重以 `PixelTooltip` 解释"影响记分卡权重"）；下拉添加未选资产；上移 / 下移 / 移除。
   - **最低可接受份额**：`PixelNumberInput` 0~100，后缀"%（价值份额）"；旁边显示可达区间 `low~high`；`min > high` 时 `PixelAlert tone="gold"`"即使证明全部有利事实也只到 high%，min% 不现实"（非阻断）；`min < low` 时提示"低于最坏情形，可以更进一步"。清空即 `null`。
   - **红线**：列表 + 「添加红线」下拉，四个模板各带参数选择器（资产 / 成员），第五项"自定义"出 `PixelInput`（≤200 字，标注"由军师引用发言判定"）；最多 6 条；显示每条的可读文案（如"不接受 周明 取得 学区房"）。
   - **软目标**：同上，四个枚举（与[成员]关系不破裂 / 宠物照护权[宠物资产] / 继续居住[房产] / 付出被当庭承认）+ 自定义；最多 6 条。
   - **给代理演的话**：`PixelTextarea` ≤600 字，placeholder 举例。
   - 所有变更走 `updGoals`（`source` 自动变 `user`）。
2. 每个字段旁一句 11px 说明（`text-ink-400`），解释"这如何影响记分卡 / 简报"。
3. 接入 `SeatChapter`「我的诉求」槽位：`<GoalsForm memberId={c.seat.player_id} />`，标题带玩家名。

## 验收标准

1. 目标资产排序改变后 `c.seat.goals[player].target_assets` 顺序随之改变；不能添加重复资产；超过 5 个时添加按钮禁用。
2. 最低份额 90 时出现"不现实"警告，仍可开庭（不阻断）。
3. 模板红线不允许缺参数保存（参数未选时该条标红且 `cleanDraft` 时被剔除）；自定义红线无文本时同理。
4. 表单内容刷新页面后仍在（`sessionStorage`）。
5. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不做对手诉求区块（T17）；不改后端。
