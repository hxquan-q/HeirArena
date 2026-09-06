# T19 · 推演策略：矩阵、简报编辑器、博弈表、加载与降级

- 阶段：2 设置页
- 依赖：T17 T18 T10
- 范围：前端新文件 `frontend/src/components/seat/StrategyPanel.tsx`、`StrategyMatrix.tsx`、`BriefEditor.tsx`、`GameTablesView.tsx`，接入 `SeatChapter.tsx`
- 规模：L

## 目标

「推演策略」按钮调用 `/api/seat/strategy`，展示全员最优策略矩阵（行可展开对手完整简报）、我的七节简报编辑器（每条可启用 / 禁用 / 删除 / 新增自定义）、三张博弈表；支持"改诉求后重新推演"；无军师模型时显示降级提示。

## 设计依据

README「军师与简报」开庭前生成、可编辑、可重算；「博弈层」a/b/c；降级运行。

## 现状锚点

- `useCaseDraft`：`c.seat.strategy`、`setStrategy`、`strategizing / strategyErr`、`analysis`（T13）；`api.seatStrategy(c)`（T12）。
- 类型：`StrategyPack MatrixRow Brief BriefItem GameTables`。
- PxlKit：`PixelDataTable`（矩阵数值列）、`PixelDrawer`（展开某成员完整简报）、`PixelTabs`（三张博弈表）、`PixelSwitch`（简报条目启用）、`PixelInput`（新增自定义条目）、`PixelProgress indeterminate` + `PixelTypewriter`（生成中）、`PixelAlert`（降级 / 错误）、`PixelBadge`（威胁等级、`generated_by`）。ImportPage 的"阅卷中"遮罩是现成的加载态范式。

## 实施步骤

1. `StrategyPanel`：
   - 主按钮「推演策略」/「重新推演」（`btn-gold`）：调用 `api.seatStrategy(cleanDraft(c))`，成功 `setStrategy(pack)`；生成中遮罩（"军师正在为每一席写简报…"）。
   - 顶部状态行：`generated_by`（模型标签 / "规则版"）、生成时间、`warnings`（`PixelAlert tone="gold"`，含"未接入军师模型"时改为明确的降级说明与「去接入供应商」按钮，打开现有 `ProviderManager`）。
   - 诉求或案情变更后 `strategy` 被 T13 置空 → 显示"诉求已变化，需重新推演"。
2. `StrategyMatrix`：`PixelDataTable` 列：成员（立绘 + 名 + 关系）、法定基线、可达区间、目标资产（emoji 串）、与我的冲突（资产 emoji）、潜在同盟（头像）、策略要点（≤80 字）、威胁（`PixelBadge` high 红 / medium 金 / low 灰 / none 空）。玩家行置顶并高亮。点行 → `PixelDrawer` 展示该成员完整简报（只读，七节 `PixelAccordion`）；对手行的抽屉顶部提示"这是军师为对手写的最优打法，对手的 Agent 会照此行动"。
3. `BriefEditor`（只对玩家）：七节 `PixelAccordion`，默认展开③⑤⑦；每条 `PixelSwitch` 控制 `enabled`，删除按钮（仅 `custom` 条目可删，系统条目只能禁用），每节底部「添加一条」输入框（`custom: true`）；条目附属信息（法条 chip、Δ%、置信度 / 弃权徽标、依赖事实、证据）以小字展示。修改直接写回 `c.seat.strategy.briefs[player]`（`setStrategy` 深拷贝更新）。
4. `GameTablesView`：`PixelTabs`：「联盟」（谁可能替谁确认扶养、暴露风险）、「资产竞争」（每件不可分资产的竞争者、能否吃下、预测归属、需补偿额）、「我的收益表」（每个选项的到手价值 / 价值份额 / 拿到的资产 / 补偿）；数据来自 `strategy.game`（无 strategy 时用 `analysis.game`，标注"确定性预估"）。第四个 tab「均衡」留空并标注 T31。
5. 接入 `SeatChapter`「推演策略」槽位。

## 验收标准

1. 无供应商：点击后 200 返回，面板显示"规则版"与降级提示，矩阵数值列齐全、策略要点为空，玩家简报第⑦节有三条风险。
2. 有模型（或 mock 后端响应）：矩阵每行有策略要点与威胁等级；玩家简报可禁用条目、可添加自定义条目，刷新页面后保留。
3. 改动任一诉求后出现"需重新推演"提示且旧策略被清空。
4. 对手行抽屉显示完整简报；玩家行显示编辑器入口。
5. `npm run build` 通过。

## 验证命令

```powershell
cd frontend; npm run build; npm run lint
```

## 边界

不做均衡 tab 内容（T31）；不做开庭提交（T20）。
