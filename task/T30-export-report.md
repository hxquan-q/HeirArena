# T30 · 导出「入局推演报告」

- 阶段：4 复盘
- 依赖：T28
- 范围：后端 `backend/app/agents/orchestrator.py`（`export_markdown`）、新测试 `backend/tests/test_seat_export.py`
- 规模：S

## 目标

入局会话的 Markdown 导出在现有"庭审记录 + 最终裁决"之后追加「入局推演报告」章节，包含我的诉求与简报、全员策略矩阵（含对手推断诉求与简报摘要）、what-if 对照与举证清单、记分卡、复盘与下一局建议。旁观会话导出逐字节不变。

## 设计依据

README「结束与交付」导出全部包含；律师要一份能带走的报告。

## 现状锚点

- `orchestrator.export_markdown(session)`：现有段落顺序（法定参考份额 → 庭审记录 → 最终裁决 → 判决书 → 分配结果 → 折价补偿 → 为什么这样分 → 当庭成立的事实 → 酌情调整 → 需要进一步确认 → 漏接分析 → 和解建议 → 附加条件 → 法条依据 → 免责声明）。
- `session.case.seat`（含 `goals / strategy`）、`session.seat.debrief`（T22/T28）。
- `legal/evidence.py`（T02）。

## 实施步骤

1. `export_markdown` 末尾（免责声明之前）当 `session.case.seat` 存在时追加：
   - `## 入局推演报告`：玩家、席位模式（AI 代理 / 亲自发言的回合数，统计 transcript 中玩家 turn 是否来自 `/speak`——在 T23 的 `_speak_player` 给 `turn.meta` 加 `"by": "human"` 标记，`_normalize_meta` 允许透传该键）、军师模型标签。
   - `### 我的诉求`：目标资产（有序）、最低价值份额、红线（可读文案）、软目标、自由文本。
   - `### 我的策略简报`：七节，只列启用条目，条目后括注法条 / Δ% / 置信度。
   - `### 全员策略矩阵`：表格列 = 成员 / 法定基线 / 可达区间 / 目标资产 / 与我的冲突 / 潜在同盟 / 策略要点 / 威胁 / 实际达成度；表后每位对手一段"推断诉求 + 简报摘要（③⑤两节前 3 条）"。
   - `### 博弈分析`：联盟表、资产竞争表、我的收益表（各一张 Markdown 表）；有均衡（T31）时追加。
   - `### what-if 对照与举证清单`：每条 what-if 一行（事实、Δ%、法条、证据类型）。
   - `### 记分卡`：玩家分项与总分（含公式与是否触顶）；全员达成表。
   - `### 复盘与下一局建议`：`narrative`、`next_time`；无军师时写"未接入军师模型，未生成叙事复盘"。
2. 工具函数：`_goals_lines(goals, case)`、`_brief_lines(brief)`、`_matrix_table(strategy, scorecards, case)` 放在 `orchestrator.py` 底部或新文件 `backend/app/seat/report.py`（推荐后者，`export_markdown` 只调用）。
3. 中文可读化：红线 / 软目标模板 → 文案映射与前端一致（例："不接受 周明 取得 学区房"）。

## 验收标准

1. 旁观会话导出与改动前完全相同（测试里对同一 mock 会话导出做字符串相等断言，基准取自本任务开始前的实现）。
2. 剧本模式入局会话导出含以上所有二级标题；矩阵表行数 = 有诉求成员数；记分卡总分与 `debrief` 一致。
3. 无 `strategy`（开庭前未推演）时报告仍生成，简报节写"开庭前未推演策略"。
4. Markdown 表格列数一致（用简单解析断言每行 `|` 数相同）。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_export.py; .venv/Scripts/python -m pytest -q
```

## 边界

不改前端；导出入口按钮沿用现有 `api.exportUrl`。
