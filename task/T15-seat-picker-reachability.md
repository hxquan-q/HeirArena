# T15 · 席位选择器与可达区间提示

- 阶段：2 设置页
- 依赖：T14 T07
- 范围：前端新文件 `frontend/src/components/seat/SeatPicker.tsx`、`frontend/src/components/seat/ReachabilityHint.tsx`，接入 `SeatChapter.tsx`
- 规模：M

## 目标

在第 IV 卷选"我是谁"：列出所有可入局成员（非宠物、非 AI 分身、未先亡），选中后立刻显示这一席位的法定基线与可达区间（来自 `useSeatAnalysis`），非继承人诚实显示"无法定份额"及原因。

## 设计依据

README「诉求」可入局成员范围与可达区间；律师工具的诚实原则。

## 现状锚点

- `frontend/src/pages/SetupPage.tsx` 第 III 卷角色卡：横向卡片列表（`role="listbox" aria-label="出席角色"`）、`CharacterPortrait` 立绘、法定份额 HP 条读 `preview.shares`；`memberAgent(m)` 把 Member 映射成 `AgentSpec` 给立绘用——把它抽到 `frontend/src/lib/agentSpec.ts` 共享。
- `useCaseDraft`：`c.seat.player_id`、`enterSeat / setPlayer`、`analysis`（T13）。
- `SeatAnalysis.reachability`、`matrix[].no_legal_share_reason`（T07）。

## 实施步骤

1. `SeatPicker`：
   - 候选 = `c.members.filter(m => !['pet','ai_twin'].includes(m.relation) && !m.deceased && m.name)`；空时 `PixelEmptyState`（"先在第 III 卷传唤至少一位家人"）。
   - 每张卡：立绘（复用第 III 卷卡片样式，`selected` 态用金色边框 + `PixelBadge` "这是我"）、姓名、关系、人设 chip、法定份额（`preview.shares`），非继承人显示 `PixelBadge tone="neutral"`"无法定份额"。
   - 点击 → 无 seat 时 `enterSeat(id)`，有 seat 时 `setPlayer(id)`；`sfx('confirm')`。
2. `ReachabilityHint`（选中后显示）：
   - 读 `analysis.reachability`：三段式条形（`PixelProgress` 或自绘像素条）标出 `low / legal_pct / high`；下方两行"法定基线 x% · 可达区间 low%~high%"与"价值份额区间 value_low%~value_high%（含房产等不可分资产与折价补偿）"。
   - `analyzing` 时 `PixelSkeleton`；`analysisErr` 时 `PixelAlert tone="red"`。
   - 非继承人：`PixelAlert tone="gold"` 显示 `no_legal_share_reason`，并说明"你仍可入局：可争取第 1131 条酌分（需证明扶养事实）或通过协商取得资产"。
3. 接入 `SeatChapter` 的席位区块槽位；`useSeatAnalysis()` 在 `SeatChapter` 顶层挂载一次。

## 验收标准

1. 预设「猫比儿子亲」：候选不含橘猫与 AI 分身；选女儿后显示基线与区间，数值与后端 `/api/seat/analyze` 一致。
2. 选前任：显示"无法定份额"与原因，不报错。
3. 切换玩家时区间随之刷新（防抖后一次请求）。
4. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不做诉求表单（T16）；不做 what-if 面板（T18）。
