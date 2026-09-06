# T09 · 矩阵策略要点与全员简报生成、信息隔离

- 阶段：1 军师
- 依赖：T07 T08
- 范围：后端新文件 `backend/app/seat/prompts.py`、`backend/app/seat/advisor.py` 新增函数、新测试 `backend/tests/test_seat_prompts.py`
- 规模：L

## 目标

军师根据确定性分析（T07 的 `SeatAnalysis`）为全员各生成一份七节简报，并为矩阵补上策略要点与威胁等级。提示词构造必须满足信息隔离与人设参考两条纪律，并用测试钉死。1 次矩阵调用 + N 次并行简报调用。

## 设计依据

README「军师与简报」全部条目，特别是：七节结构、弃权、律师伦理、人设是参考输入且简报优先、信息隔离（成员 i 只见公开信息 + 自己诉求；玩家额外见全员诉求）。

## 现状锚点

- 公开信息的现成文本：`orchestrator.case_facts_text()`、`legal_shares_text()` 的拼装方式（`_assets_block` / `_people_block`），本任务在 `prompts.py` 重写同等内容的纯函数版本（不依赖 Orchestrator 实例）。
- 人设风格文案：`backend/app/agents/personas.py` `PERSONALITY_STYLE`、`persona_prompt`。
- 可引用法条：`personas.AVAILABLE_ARTICLES`。
- T02 `hint_for`、T03 `whatif/reachability`、T05 博弈表。

## 实施步骤

1. `prompts.py` 纯函数：
   - `public_context(case, legal) -> str`：案情、遗产清单、出席人员（含每人 wish、人设、法定地位与份额）、争议摘要。**不含任何 `Goals` 字段。**
   - `deterministic_context_for(analysis, member_id) -> str`：该成员的可达区间、what-if 列表（含举证清单）、联盟表中与其相关的行、资产竞争表、（玩家时）收益表。
   - `own_goals_block(goals) -> str`：把一份 `Goals` 排版成文字。
   - `persona_guidance(member) -> str`：人设 → 风格与风险偏好（孝顺型少攻击多结盟；贪婪型高锚定争高价值资产；律师型条文与程序；佛系早让步换关系；戏精情绪表达但**不得**据此当庭自认；精算师数字与方案；忠诚 / 捣蛋按 `PERSONALITY_STYLE`），末尾固定一句"涉及自认、放弃、确认扶养与资产诉求时，以下简报优先于人设"。
   - `brief_messages(case, legal, analysis, member_id, all_goals, player_id) -> list[dict]`：`system = SAFETY_PREAMBLE + 七节说明 + 弃权纪律`；`user = public_context + deterministic_context_for + persona_guidance + own_goals_block(all_goals[member_id])`；当 `member_id == player_id` 时追加"【你掌握的对手情报】"= 其他成员的 `Goals`；**当 `member_id != player_id` 时绝不追加任何他人的 `Goals`**。
   - `matrix_messages(case, legal, analysis, all_goals, player_id)`：矩阵是玩家视角的产物，可包含全员 `Goals`；要求每行输出 `strategy_summary ≤80 字`、`threat_level`、`rationale`。
2. `advisor.py`：
   - `async def generate_briefs(client, case, legal, analysis, all_goals, player_id) -> dict[str, Brief]`：对每位非宠物非 AI 在世成员 `asyncio.gather` 并行调用 `complete_schema(..., BriefOut)`，把 `BriefOut` 转 `Brief`（`BriefItem.id = f"{section}-{index}"`，`enabled=True`，`generated_by=client.label`）。单个成员失败 → 该成员用 `rules_brief(analysis, member_id)` 兜底（只填①②③⑦四节的确定性内容：基线、可达区间、杠杆与举证、"不要说的话"列表），并记 warning。
   - `async def generate_matrix_summary(client, ...) -> dict[str, tuple[str, str]]`。
   - `rules_brief(...)`：无模型时的确定性简报，第⑦节固定三条风险：承认未尽义务（−3）、放弃份额（−3）、协商阶段主动让步（−1.5），措辞引用 `_fact_based_plan` 的步长。
3. `seat_secret_strings(case) -> list[str]`：测试与 T11 共用的工具，返回玩家的 `min_value_share`（格式化）、所有 `red_lines/soft_goals.text`、`narrative` 以及被用户编辑（`source="user"`）的对手诉求文本片段。

## 验收标准

1. `brief_messages(..., member_id=对手)` 拼出的全文不包含 `seat_secret_strings(case)` 中任一字符串（用带哨兵的诉求测，例如 `narrative="SENTINEL_PLAYER_ONLY"`）。
2. `brief_messages(..., member_id=玩家)` 包含对手 `Goals` 的内容。
3. 每位成员的提示词含 `persona_guidance`，且含"简报优先于人设"字样。
4. 假客户端返回合法 `BriefOut` 时 `generate_briefs` 返回全员 `Brief`；某成员两次返回非法 JSON 时该成员得到 `rules_brief` 且 warnings 非空，其余成员不受影响。
5. 生成的每条 `BriefItem.article` 若非空必须在 `ARTICLES`；越界的在转换时置空并记 warning。
6. 提示词中所有 `<case_data>` 段落带不可信声明。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_prompts.py tests/test_seat_advisor.py; .venv/Scripts/python -m pytest -q
```

## 边界

不接接口（T10）；不注入代理提示词（T11）；不生成发言卡与复盘（T24、T28）。
