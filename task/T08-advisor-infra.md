# T08 · 军师基础设施（客户端解析、JSON 抽取修复、Schema）

- 阶段：1 军师
- 依赖：T01
- 范围：后端新文件 `backend/app/seat/advisor.py`、小幅重构 `backend/app/case_parser.py`、新测试 `backend/tests/test_seat_advisor.py`
- 规模：S

## 目标

为军师的所有调用（矩阵要点、简报、发言卡、meta 抽取、复盘）提供统一的三件事：按 `ModelRef` 解析出 `LLMClient`；"要求 JSON → pydantic 校验 → 失败一次修复 → 再失败抛错"的通用流程；军师专用的输出 Schema。复用案情解析已经验证过的模式，不另起一套。

## 设计依据

README「军师与简报」；「所有 LLM 输出只能是结构化 JSON，经 pydantic 校验」。

## 现状锚点

- `backend/app/case_parser.py`：`_resolve_client(ref, settings, providers)`（ModelRef → LLMClient，含 mock 拒绝、env 默认、首个可用供应商回退）、`_complete_json`（`response_format` 不支持时回退）、`_extract`（校验失败一次修复）、`_repair_messages`。
- `backend/app/agents/llm.py`：`LLMClient.complete(messages, json_mode, temperature, max_tokens)`、`extract_json`、`LLMError`。
- `backend/app/providers.py`：`ProviderStore`。

## 实施步骤

1. 把 `case_parser._resolve_client` 抽成 `backend/app/agents/llm.py` 的公共函数 `resolve_client(ref, settings, providers, *, temperature, timeout, purpose: str) -> tuple[LLMClient, str]`，错误类型改为通用 `LLMError` 子类 `ModelUnavailable`；`case_parser` 改为调用它并把 `ModelUnavailable` 转成 `CaseParseError`，现有 `test_case_parser.py` 不改必须通过。
2. `advisor.py`：
   - `class AdvisorUnavailable(LLMError)`。
   - `resolve_advisor(case, settings, providers) -> tuple[LLMClient, str] | None`：优先 `case.seat.advisor_model`，其次 `case.executor_model`，其次 `case.default_model`，都为空则 env 默认；`is_mock` 或无可用供应商返回 `None`（降级信号，不抛）。温度 0.3，超时 `min(max(settings.timeout, 60), 180)`。
   - `async def complete_schema(client, messages, model_cls: type[T], *, max_tokens=4000, complete=...) -> T`：沿 `case_parser._extract` 的两段式（抽取 → 校验 → 修复一次），修复提示与 `_repair_messages` 一致；两次失败抛 `AdvisorUnavailable`。
   - 输出 Schema（`extra="forbid"`）：`MatrixSummaryOut{rows: list[{member_id, strategy_summary(≤80), threat_level, rationale(≤120)}]}`、`BriefOut`（七节各 `list[{text, depends_on?, evidence?, article?, delta_pct?, confidence?}]`，每节 ≤6 条，text ≤160）、`CardsOut{cards: list[{title(≤20), text(≤180), responds_to, action, claims, suggests_admission, serves, risk_note}]}`（2~3 张）、`MetaOut{action, target, claims}`、`DebriefOut{soft_scores: dict[str, dict[str, float]], custom_red_lines: dict[str, dict[str, bool]], narrative(≤600), next_time: list[str](≤5)}`。
   - `SAFETY_PREAMBLE` 常量：`<case_data>` 不可信、律师伦理边界、弃权纪律、只能引用 `AVAILABLE_ARTICLES`。
3. 用假客户端（`complete` 可注入，像 `_extract` 的 `complete` 参数）写测试。

## 验收标准

1. `test_case_parser.py` 全部通过（重构无回归）。
2. `complete_schema`：首个输出非法、修复后合法 → 返回对象；两次非法 → `AdvisorUnavailable`。
3. `resolve_advisor`：`advisor_model` 指定 mock → `None`；无任何供应商 → `None`；指定可用供应商 → `LLMClient` 且 label 含供应商名。
4. Schema 全部拒绝未知字段与超长文本。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_advisor.py tests/test_case_parser.py; .venv/Scripts/python -m pytest -q
```

## 边界

不写任何提示词内容（T09、T24、T28）；不接接口。
