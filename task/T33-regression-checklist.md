# T33 · 全量回归与手动走查

- 阶段：收尾
- 依赖：全部任务
- 范围：无代码变更（发现问题回到对应任务修）
- 规模：M

## 目标

在所有任务完成后，做一次完整的自动化回归与手动走查，确认五条全局不变量成立、旁观模式零回归、入局模式三种运行方式（有军师 / 无军师剧本 / 混合）都能走通并可重启续跑。

## 自动化

```powershell
cd backend; .venv/Scripts/python -m pytest -q
cd ../frontend; npm run lint; npm test; npm run build
```

要求：0 失败；新增测试文件齐全：`test_seat_models test_seat_evidence test_seat_analysis test_seat_game test_seat_scoring test_seat_api test_seat_advisor test_seat_prompts test_seat_blind test_seat_runtime test_seat_turn test_seat_debrief test_seat_export`；前端 `useCaseDraft.test.ts`、`useCourt.test.ts` 含席位用例。

## 手动走查清单

**旁观零回归**
1. 大厅选预设 → 设置页四卷 → 第 IV 卷保持「旁观全员」→ 开庭：显灵行动栏、证据宝箱、押注、休庭 / 续庭、导出全部与改动前一致；SSE 里没有 `seat / awaiting_player / cards / debrief`。
2. 导入示例案情 → 「回填卷宗，去核对」→ 开庭，同上。

**入局 · 无模型（剧本）**
3. 第 IV 卷切入局 → 选女儿 → 可达区间显示 → 填最低份额 90 出现"不现实"警告 → 加红线"不接受出售学区房" → what-if 打开"证明主要扶养"看到差分 → 「推演策略」返回规则版并提示未接入军师 → 开庭。
4. 庭审：席位开关切到"我" → 轮到我出现横幅与输入区（无发言卡，提示自由发挥）→ 勾"放弃部分份额"发送 → 庭审记录出现我的发言 → 裁决的当庭事实含 `waive_share` → 复盘记分卡出现（软目标灰显）→ 导出含「入局推演报告」。
5. 等待态刷新页面：仍在等待；重启后端（`uvicorn` 重启）：会话状态仍 `awaiting_player`，不自动续跑；`/speak` 后续跑。

**入局 · 有军师**
6. 接入一个真实供应商（或 codex-bridge）：「推演策略」生成矩阵要点与全员简报；禁用玩家简报一条、新增一条自定义；改一条对手诉求 → 提示需重新推演 → 重算。
7. 开庭后席位为 AI：观察玩家代理的发言明显围绕简报（例如主张目标资产、回应威胁高的对手）；对手也在争。
8. 协商阶段切到"我"：收到 2~3 张发言卡 → 「用这张」→ 复选框未被勾选 → 发送；「改由 AI 代说」也验证一次。
9. 闭庭：`debrief` 到达，叙事复盘与下一局建议出现，turn_id 可跳转；导出报告完整。

**不变量抽查**
10. 用后端日志或测试钩子确认执行官五处提示词不含诉求 / 简报字样（`executor_prompt_samples()`）。
11. 对手简报文本中搜索玩家的自由文本哨兵，确认不存在。

## 验收标准

清单 1–11 全部通过；任何失败项在对应任务号下修复后重跑本任务。

## 产出

在 PR 描述或 `task/RESULT.md`（可选）记录：走查日期、使用的模型、发现并修复的问题列表。
