# T17 · 对手推断诉求（折叠、可编辑、可恢复推断）

- 阶段：2 设置页
- 依赖：T16
- 范围：前端新文件 `frontend/src/components/seat/OpponentGoals.tsx`，接入 `SeatChapter.tsx`
- 规模：S

## 目标

在第 IV 卷展示系统推断的每位对手诉求，默认折叠；用户可展开编辑（复用 `GoalsForm`），也可一键"恢复系统推断"。编辑过的对手诉求会进入玩家简报的"对手情报"，但不进对手自己的简报之外的任何提示词（后端 T09 保证）。

## 设计依据

README「诉求」：对手诉求由确定性规则推断，用户可编辑；信息隔离。

## 现状锚点

- `useCaseDraft`：`c.seat.goals`（含 `source`）、`analysis.inferred_goals`、`applyInferred`、`resetGoals`、`updGoals`（T13）。
- `GoalsForm`（T16）。
- PxlKit：`PixelAccordion`、`PixelBadge`、`PixelButton`。

## 实施步骤

1. `OpponentGoals`：对手 = 可入局成员中除玩家外的全部（宠物 / AI 分身不列）。每人一个 `PixelAccordion` 项，标题：立绘小图 + 姓名 + 关系 + `PixelBadge`（`source === 'user'` → "已修改" gold；否则 "系统推断" neutral）+ 一句诉求摘要（目标资产首项 + 最低份额）。
2. 展开内容：`<GoalsForm memberId={id} compact />` + 按钮「恢复系统推断」（`resetGoals(id)` 后由下一次 analysis 的 `applyInferred` 带回；按钮仅在 `source === 'user'` 时可用）。
3. 顶部说明："这些是系统从 wish、人设和法定地位推断的对手诉求。你了解的内情可以直接改——它只会进入你的简报，不会泄露给其他对手。"
4. 接入 `SeatChapter`「对手诉求」槽位。

## 验收标准

1. 预设案件默认折叠、每位对手都有摘要；展开编辑后徽标变"已修改"，刷新页面保留。
2. 「恢复系统推断」后徽标回到"系统推断"，字段等于 `analysis.inferred_goals[id]`。
3. 删除某对手成员后其条目消失且 `goals` 不再含其键（T13 `pruneSeat`）。
4. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不做矩阵 UI（T19）。
