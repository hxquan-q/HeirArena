# T21 · 导入页快捷入口「我是 ___ → 以此视角入局」

- 阶段：2 设置页
- 依赖：T14
- 范围：前端 `frontend/src/pages/ImportPage.tsx`、`frontend/src/store/useCaseDraft.ts`（`applyParsed` 的可选参数）
- 规模：S

## 目标

案情解析完成后，在角色列表里让用户直接选"我是谁"，点「以此视角入局」即回填卷宗、进入入局模式（诉求用该角色的 `wish` 预填）并跳到设置页第 IV 卷；原来的「回填卷宗，去核对」按钮保留为旁观路径。

## 设计依据

README「入口」导入页快捷键；导入是"当事人把自家情况导进来"的主要路径。

## 现状锚点

- `ImportPage.tsx`：解析结果区块「执行官读到了这些」的 `result.case.members` 列表（每行姓名 / 关系 / 人设 / 事实标签 / wish）；右侧「解析完成」卡的 `commit()`（`applyParsed(result); nav('/setup')`）。
- `useCaseDraft.applyParsed`（T13 已保留 seat 的处理）、`enterSeat`。
- `SetupPage` 的 `step` 是组件内 `useState(0)`：需要一种方式让它打开第 IV 卷——用路由 query `/setup?chapter=seat`，在 `SetupPage` 初始化时读取一次。

## 实施步骤

1. 成员列表每行增加一个 `PixelChip`/单选按钮「这是我」（宠物、AI 分身、已故不可选），选中态金色；顶部说明"想从某个人的视角推演？选一位，再点右侧「以此视角入局」"。
2. 右侧「解析完成」卡新增次按钮「以此视角入局」（`btn-gold`，有选中才可用）：`applyParsed(result)` → `enterSeat(selectedId)` → `nav('/setup?chapter=seat')`。原按钮文案不变。
3. `SetupPage`：读取 `useSearchParams` 的 `chapter`，等于 `seat` 时初始 `step = CHAPTERS.findIndex(c => c.id === 'seat')`，并清掉 query（`replace`）。
4. `enterSeat` 的 `goalsFromWish` 已在 T13；确认 `wish` 为空时 `narrative` 用 `default_wish` 的前端等价（人设默认心愿表复制自 `personas.default_wish`，放 `frontend/src/lib/wish.ts`）。

## 验收标准

1. 装入示例案情 → 解析 → 选"周晓" → 「以此视角入局」→ 设置页打开在第 IV 卷，模式为入局，玩家为周晓，`narrative` 等于其 `wish`，`target_assets` 含被 wish 命中的资产。
2. 不选任何人时按钮禁用；原「回填卷宗」路径行为不变。
3. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不改后端解析器。
