# T24 · 发言卡与轻量 meta 抽取（军师）

- 阶段：3 庭审
- 依赖：T23
- 范围：后端 `backend/app/seat/advisor.py`、`backend/app/seat/prompts.py`、`backend/app/agents/orchestrator.py`（`_cards_for`）、`backend/app/main.py`（`/cards`、`/speak` 的 meta 抽取）、测试并入 `backend/tests/test_seat_turn.py`
- 规模：M

## 目标

轮到玩家时自动生成 2~3 张发言卡（草稿正文 + 回应谁 + 服务简报哪一条 + 是否"建议"某种自认 + 风险提示），支持「重新起草」；玩家提交正文时由军师抽取动作 / 目标 / 资产诉求（自认永不由模型产生）。无军师模型时两者都优雅降级。

## 设计依据

README「庭审交互」：每次轮到我自动发 2~3 张卡；卡片永不自动勾选自认；meta 混合抽取、自认只能显式勾选；军师失败仍可自由打字或改由 AI 代说。

## 现状锚点

- T08 `complete_schema`、`CardsOut`、`MetaOut`、`resolve_advisor`；T09 `prompts.public_context`、玩家简报（`case.seat.strategy.briefs[player]`）。
- `orchestrator._debater_messages` 的 `phase_hint` 与 `_transcript_block(limit)` 可复用为发言卡的上下文；`_normalize_meta` 是最终白名单。
- T23 `_await_player` 预留的 `_cards_for(key, m, phase, round_no, focus)` hook；`seat.cards[turn_key]`。

## 实施步骤

1. `prompts.cards_messages(case, legal, brief_enabled_items, phase, round_no, focus, transcript_text, attacked_by_name) -> list[dict]`：要求输出 2~3 张卡；每卡 `text` 80~180 字、第一人称、只引用 `AVAILABLE_ARTICLES`；`responds_to` 只能是出席者 id；`serves` 引用简报条目 id；**`suggests_admission` 只允许 `null | "acknowledge_support:<id>"`**（不得建议 `admit_neglect` / `waive_share`，除非简报第⑤节明确把"放弃换资产"作为策略，此时也只能以 `risk_note` 说明后果，`suggests_admission` 仍为 `waive_share` 由玩家决定是否勾选）；律师伦理与不可信声明同 T09。
2. `advisor.generate_cards(client, ...) -> list[dict]`：`complete_schema(..., CardsOut)`，把 `claims` 过滤到已知资产 id、`responds_to` 过滤到出席者；失败抛 `AdvisorUnavailable`。
3. `orchestrator._cards_for`：无军师（`resolve_advisor` 为 None）→ `[]`；有 → 调用，异常时 `emit("notice", {"level":"warn","text":"军师起草失败：…，你可以自由发言或改由 AI 代说"})` 并返回 `[]`。结果写 `seat.cards[key]`（幂等：已存在直接返回）。`emit("cards", {"turn_key", "cards"})`。
4. `POST /api/sessions/{id}/cards`：须 `awaiting_player`；删除 `seat.cards[turn_key]` 后重新生成并 emit；返回卡片。
5. `/speak` 的 meta 抽取：若 body 未提供 `meta.action/target/claims` 中的任一项且有军师 → `prompts.meta_messages(text, participants, assets)` + `complete_schema(MetaOut)` 补齐缺项；`admissions` **始终**取 body 中的表单值（缺省 `[]`），忽略模型任何自认输出；抽取失败 → `action="propose"`、`target=None`、`claims={}`。
6. `prompts.meta_messages`：只输出 `{action, target, claims}`，明确"不要判断自认"。

## 验收标准

1. 假军师返回 3 张合法卡 → `cards` 事件一次、`seat.cards[key]` 长度 3、每卡 `suggests_admission ∈ {None, "acknowledge_support:<有效id>"}`；返回含 `admit_neglect` 的卡被过滤或整体拒绝并 notice。
2. 无军师：`awaiting_player` 正常发出，`cards` 事件 payload 为空数组（或不发，二选一并在事件文档写明——推荐发空数组以便前端统一处理）。
3. `/speak {text:"周明你八年没回家…"}` 无 meta：假军师返回 `{action:"attack", target:儿子}` → 落库 `meta.action == "attack"`，`admissions == []`；假军师返回 `admissions:["admit_neglect"]` 也被忽略。
4. `/cards` 重新起草后卡片内容更新且再次 emit。
5. 现有测试全过。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_turn.py tests/test_seat_advisor.py; .venv/Scripts/python -m pytest -q
```

## 边界

不做前端；不做复盘。
