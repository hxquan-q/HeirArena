# T32 · 文档：README、docs 设计说明、API 与 SSE 列表

- 阶段：收尾
- 依赖：全部功能任务
- 范围：`README.md`、新文件 `docs/入局推演-设计说明.md`、`CONTRIBUTING.md`（若有测试说明需补）
- 规模：S

## 目标

让新用户和贡献者从 README 就知道「入局推演」是什么、怎么玩、接口与事件有哪些；把 `task/README.md` 的设计决策整理成一份正式的设计说明放进 `docs/`。

## 现状锚点

- `README.md`：「它是怎么玩的」5 点；「接入模型：供应商 → 角色」；「目录结构」；「API 速览」表；SSE 事件列表行；「测试」。
- `task/README.md`：设计决策全集、不变量、术语表（本任务的内容来源）。

## 实施步骤

1. README「它是怎么玩的」新增第 6 点「入局推演」：一段话说明选席位、写诉求、军师简报与全员矩阵、AI 代打或亲自发言、发言卡与自认勾选、记分卡与复盘、导出报告；强调"执行官对席位盲判、份额仍只随当庭事实变动、军师建议不构成法律意见"。
2. 「接入模型」一节增加「军师」槽位说明。
3. 「目录结构」增加 `backend/app/seat/`（analysis / game / scoring / advisor / prompts / report）、`backend/app/legal/evidence.py`、`frontend/src/components/seat/`、`task/`。
4. 「API 速览」增加：`POST /api/seat/analyze`、`POST /api/seat/strategy`、`PUT /api/sessions/{id}/seat`、`POST /api/sessions/{id}/speak`、`POST /api/sessions/{id}/cards`；`/interject` 备注"入局会话返回 409"。SSE 事件列表追加 `seat awaiting_player cards debrief`。
5. 「测试」一节列出新增测试文件名。
6. `docs/入局推演-设计说明.md`：以 `task/README.md` 的「功能一句话」「设计决策全集」「全局不变量」「术语表」为骨架，补充用户旅程（选席 → 诉求 → 推演 → 开庭 → 席位切换与发言 → 复盘 → 导出）、数据模型概览（引用 `models.py` 的类名）、状态机图（`running → awaiting_player → running → … → done`，用 Mermaid）、信息隔离矩阵（谁能看到什么）、已知限制与后续（证据卡机制、多次推演、对手强度、庭审中 what-if）。
7. 免责声明段补一句："入局推演给出的策略与记分卡是基于你输入事实的沙盘推演，不构成法律意见。"

## 验收标准

1. README 中新增接口与事件与代码一致（逐条对照 `main.py` 与 `client.ts`）。
2. 设计说明能独立读懂，不引用聊天记录。
3. Markdown 表格与代码块渲染正常（本地预览一次）。

## 验证命令

无自动化；人工核对。

## 边界

不改代码。
