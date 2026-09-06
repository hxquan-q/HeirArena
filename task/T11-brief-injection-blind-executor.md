# T11 · 简报注入代理提示词、执行官盲判

- 阶段：1 军师
- 依赖：T09
- 范围：后端 `backend/app/agents/role_agents.py`、`backend/app/agents/orchestrator.py`、新测试 `backend/tests/test_seat_blind.py`
- 规模：M

## 目标

入局会话中，每位成员的 Agent 在两条发言路径（`create_agent` 与直连回退）都拿到自己那份**启用条目**的简报；执行官的所有提示词一字不含席位信息；旁观会话的提示词与改动前逐字节一致。

## 设计依据

README 不变量 1、3、4；「人设是嗓音、简报是大脑，涉及份额符号与资产诉求时简报优先」。

## 现状锚点

- `backend/app/agents/role_agents.py`：`_debater_system(orch, member_id)`（`create_agent` 路径的 system prompt，含【你的人设】【你的心愿】+ `DEBATER_RULES`）、`_executor_system(orch)`。
- `backend/app/agents/orchestrator.py`：`_debater_messages(...)`（直连回退与 mock 都会先构造的完整 system+user）、`_executor_messages(kind, extra)`、`_summarize_focus_issues`、`_debate_intro`、`_negotiation_intro`、`_verdict` 里的 `ask` 字符串；`Orchestrator.__init__` 中 `self.case`。
- 代理的 `create_agent` 路径 `config={"recursion_limit": 8}`，system prompt 越长越要控制条目数。

## 实施步骤

1. `orchestrator.py` 新增只读属性 `seat_brief_text(member_id) -> str`：`case.seat` 为 None 或该成员无简报时返回 `""`；否则拼装"【你的策略简报（私有，只有你看得到）】"+ 七节中 `enabled=True` 的条目（每节标题 + 编号短句，条目总数 ≤ 25，单条截到 160 字）+ 固定尾句"语气按你的人设，策略按本简报；凡涉及自认、放弃、确认他人扶养与资产诉求，以简报为准。"
2. `_debater_system` 与 `_debater_messages` 的 system 段在【你的心愿】之后插入 `seat_brief_text(m.id)`（为空字符串时不插入任何字符，保证旁观模式逐字节不变）。
3. 执行官侧不做任何改动，但新增防护：`_executor_messages`、`_summarize_focus_issues` 的 `ask`、`_debate_intro`、`_negotiation_intro`、`_verdict` 的 `ask` 都不得引用 `self.case.seat`。在 `Orchestrator` 加一个仅测试使用的 `executor_prompt_samples()`，返回这五处以当前会话数据渲染出的文本列表。
4. mock 路径（`mock_speech`）不读简报，保持不变。

## 验收标准

1. 旁观会话（`seat=None`）：对同一案件、同一 `session.id`，改动前后 `_debater_messages` 与 `_debater_system` 输出逐字节相同（测试里以本任务开始前的实现输出为基准快照，或直接断言输出不含"策略简报"且长度不变）。
2. 入局会话：玩家与每位对手的 `_debater_system` 含自己的简报条目文本，不含他人的简报条目文本；`enabled=False` 的条目不出现。
3. `executor_prompt_samples()` 的每段文本都不包含 `seat_secret_strings(case)` 中任一字符串，也不包含"简报"二字。
4. 条目数超过 25 时截断，且第⑦节风险条目优先保留。
5. 现有 `test_orchestrator_mock.py`、`test_verdict_facts.py` 通过。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_blind.py; .venv/Scripts/python -m pytest -q
```

## 边界

不改发言顺序、不改裁决逻辑、不做等待玩家（T23）。
