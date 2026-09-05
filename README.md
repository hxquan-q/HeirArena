# HeirArena · 遗产竞技场

> 把严肃的遗产分配，变成一场 AI 多 Agent 的「家庭剧 + 辩论竞技场」。
> 你是立遗嘱的人：填好资产、家人和几句"剧情设定"，系统就会生成一群性格鲜明的 AI 继承人，
> 让它们在虚拟听证庭上争吵、结盟、谈判——最后由中立的「遗嘱执行官」依据《民法典》继承编敲槌裁决。

![courtroom](docs/screenshot-courtroom.png)

## 它是怎么玩的

1. **建立卷宗**：手动输入资产、家人关系和剧情设定，选择四个内置剧本，或者上传 / 粘贴 UTF-8 编码的 `.md / .markdown / .txt` 案情（可参考 `demo/sample-case.md`），由所选模型自动抽取人物、关系、资产、公开事实、角色性格与诉求，再回填设置页供用户确认。
2. **规则引擎先算法定份额**：依据《民法典》第 1122、1125、1127、1128、1129、1130、1131、1132、1144、1153、1156 条，确定性地算出每个人的参考份额与法条依据（夫妻共同财产先析产、代位继承、继子女扶养关系、丧偶儿媳视为第一顺序、多分 / 少分、被扶养人酌分……）。这是整场辩论不可逾越的"锚"。
3. **开庭**：遗嘱执行官宣读案情 → 每位 Agent 开场陈述 → 若干轮辩论（攻击 / 结盟 / 提案 / 让步）→ 协商 → 落槌裁决。
4. **幽灵插话**：庭审进行中，你可以随时以"逝者的幽灵"身份插一句话，下一位发言的 Agent 会当场做出反应。
5. **裁决**：执行官只能依据当庭成立的符号化法律事实，在用户选择的范围内酌情调整（默认 ±5 个百分点，也可选严格法定 0 或戏剧 15），再把不可分割的房、车、宠物、纪念物给最在乎它的人，用存款找平、不够就折价补偿（第 1156 条）。输出饼图、逐项资产归属、补偿关系、调整理由、来源发言与法条依据，并可导出 Markdown 庭审记录。

## 视觉

- 等距风格 SVG 法庭：木质墙板、天平徽章、夜窗与壁灯、法官席、证人台、红毯与家属席。
- 程序化生成的 Agent 小人：法官袍与法槌、贪婪者的金币、孝顺者的相框、精算师的眼镜、律师的领带与文书、前任的墨镜、捣蛋鬼的小角；宠物是会摇尾巴的猫 / 狗；AI 分身是带天线的机器人。
- 状态动画：思考气泡、发言声波、生气冒烟、开心闪光；发言者走上证人台、聚光灯亮起；攻击画红色虚线、结盟画绿色实线；落槌时全屏震动 + "咚！"。
- 右侧面板：家族关系图（含 ✝ 先亡、代位、婚姻 / 已离婚、无继承权标注）、法定份额与法条全文、实时庭审记录、最终裁决。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vite 8 · React 19 · TypeScript · Tailwind CSS 4 · Motion · Zustand · Recharts · React Router |
| 后端 | Python 3.10+ · FastAPI · SSE 实时流 · SQLite + SQLModel · httpx（OpenAI 兼容流式接口） |
| 编排 | [LangGraph](https://github.com/langchain-ai/langgraph) 状态机：开庭 → 陈述 → 辩论 → 协商 → 裁决；SqliteSaver Checkpointer 支持中断 / 重启后续庭 |
| Agent | [LangChain](https://github.com/langchain-ai/langchain) `create_agent()` 创建各角色及执行官；工具读取案情、发言记录、法定份额 |
| 法律 | 《民法典》继承编规则引擎（含单元测试） · 有限自主裁量的裁决器 · 资产分配 / 折价补偿算法 |

## 接入模型：供应商 → 角色

1. 首页右上角 **「模型供应商」**：从预设（DeepSeek、通义千问、Moonshot Kimi、智谱 GLM、火山方舟、硅基流动、OpenAI、OpenRouter、Ollama、LM Studio、自定义）选一个，填 Base URL 和 API Key，保存。可以「测试连通」（发一次 8 token 的补全）和「拉取模型」（GET `/models`）。配置写在本机 `backend/data/providers.json`，Key 不会回传到浏览器。
2. 在案件里分配模型：
   - **默认辩论模型**：所有角色的兜底；
   - **遗嘱执行官**：单独指定裁决用的模型（建议用更强的模型，它要输出结构化 JSON）；
   - **每个角色**：展开角色卡片 → 「指定该角色发声模型」。可以让贪婪儿子用 DeepSeek、孝顺女儿用通义、橘猫走剧本，同一场混用。
3. 开庭后，席位卡和顶栏会标出每个角色实际使用的模型。

**角色是怎么"读"和"说"的**：每个角色和遗嘱执行官都是一个 LangChain `create_agent()`。发言前 Agent 通过工具读取案情、最近发言记录和规则引擎算出的法定份额，再以第一人称输出 80~150 字，并在结尾用 `---` + 一行 JSON 给出动作（攻击 / 结盟 / 提案 / 让步 / 恳求）、目标和诉求。工具或供应商调用失败时，自动回退到原来的 OpenAI 兼容直连，再失败则走剧本模式。庭审阶段由 LangGraph 推进，每一步写入 Checkpointer；服务重启后按 `thread_id`（会话 id）续庭，SSE 仍可用 `?from_seq=` 回放已落库的事件。

**Markdown 案情导入**：设置页可上传或粘贴不超过 300 KB / 10 万字符的 UTF-8 文本，并选择任意已配置的 OpenAI 兼容模型。后端要求模型输出独立的抽取 Schema，再确定性生成安全 ID 并转换为 `CaseInput`；未知枚举会触发一次自动修复，连续失败则拒绝回填。金额统一换算为万元；`main_support / neglect / dependency / deceased` 等影响法律计算的布尔事实，以及夫妻共同财产标记，必须带能在上传原文中反查的短引用，否则会被保守关闭并加入人工确认警告。上传文本被当作不可信数据，文档中的提示注入指令不会作为系统指令执行。解析后仍需用户在现有表单中确认，系统不会直接开庭。

**裁决——随机关在演出层，方向由法律事实钉死**：角色怎么吵、谁跟谁结盟、幽灵插话会不会改变态度，每场都可以不同；但份额只随**当庭成立的法律事实**变动。角色发言的 JSON 里只能输出三种符号化事实（DualPath 思路：LLM 给符号，规则引擎定数值）：

| 符号 | 含义 | 法条 | 成立条件 |
| --- | --- | --- | --- |
| `admit_neglect` | 本人承认有能力却未尽扶养义务 | 1130 | 本人说了才算 |
| `waive_share` | 本人明确放弃部分份额 | 1132 | 本人说了才算 |
| `acknowledge_support:<id>` | 承认某人尽了主要扶养义务 | 1130 | 需两位以上**其他**出席者确认 |

攻击、结盟、口才、被骂得多，一律只进 `drama_score`，不进份额；未被承认的指控进入裁决的「需要进一步确认的问题」。执行官模型拿到的是规则引擎依据这些事实算好的份额建议，它只能在案件设定的酌情范围内（默认 ±5 个百分点，可选 0 严格 / 15 戏剧）微调**有事实的成员**，每条调整必须引用对应发言的 `turn_ids`，否则被丢弃；发言里出现但不在剧情设定和案情记录里的"事实"（"爸口头答应把房子给我"）视为主张。裁决面板上"法定"与"酌情"分列，每条事实和调整都能反查到具体发言。模型不可用或输出不合法时，自动回退到纯规则裁决。

未接入任何供应商时进入 **剧本模式**（内置台词库），开箱即可演示；某个角色的模型调用失败也只会让这一句回退到剧本，庭审不会中断。

> 也可以在 `backend/.env` 里填 `LLM_API_KEY / LLM_BASE_URL / LLM_MODEL`，它会作为一个「xxx（.env）」供应商出现，并成为未指定时的默认。
>
> **代理提示**：对 `localhost / 127.0.0.1` 的供应商（Ollama、LM Studio、codex-bridge）后端会自动绕过系统代理；Windows 上开着 Clash 等系统代理时这一点很重要。

## 快速开始

```powershell
# Windows
.\start.ps1
```

```bash
# macOS / Linux
chmod +x start.sh && ./start.sh
```

或手动启动：

```bash
# 后端（http://127.0.0.1:8000，接口文档 /docs）
cd backend
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                              # 可选：填入 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
uvicorn app.main:app --reload --port 8000

# 前端（http://localhost:5173，已代理 /api 到后端）
cd frontend
npm install
npm run dev
```

## 目录结构

```
backend/
  app/
    main.py               # FastAPI：创建会话 / SSE 流 / 幽灵插话 / 暂停续庭 / 导出
    case_parser.py        # Markdown 案情：模型抽取、原文证据校验、CaseInput 规范化
    persist.py            # SQLModel：案件、角色模型绑定、庭审事件、发言、裁决
    models.py             # 案件、资产、成员、法定份额等数据模型
    legal/
      articles.py         # 民法典继承编条文（节选）
      engine.py           # 法定继承规则引擎
    providers.py          # 供应商注册表（预设、持久化、.env 合并）
    agents/
      personas.py         # 角色人设与提示词片段
      mock.py             # 剧本模式台词库
      llm.py              # OpenAI 兼容流式客户端（连通测试 / 拉取模型 / 本机地址绕过代理）
      tools.py            # create_agent 工具：案情 / 发言记录 / 法定份额
      role_agents.py      # LangChain create_agent() 工厂
      court_graph.py      # LangGraph 庭审状态机 + Checkpointer
      allocator.py        # 份额 → 具体资产归属 + 折价补偿
      orchestrator.py     # 发言、裁决与图节点实现；SSE 事件仍从这里发出
      restore.py          # 从 SQLite 重建会话，供重启后续庭
  data/                   # providers.json、heirarena.db、checkpoints.db（已 gitignore）
  tests/                  # 规则引擎、分配器、编排器、持久化 / 续庭、流式解析、模型路由测试
frontend/
  src/
    pages/SetupPage.tsx        # 立遗嘱向导（法定份额实时预览、模型分配）
    pages/CourtroomPage.tsx    # 法庭页：场景 + 阶段进度 + 面板 + 幽灵插话
    components/ProviderManager.tsx  # 供应商管理弹窗
    components/ModelSelect.tsx      # 模型选择器（跟随默认 / 剧本 / 各供应商模型）
    components/scene/          # 法庭场景、Agent 小人、气泡、连线、落槌
    components/panels/         # 关系图 / 法定份额 / 庭审记录 / 裁决
    store/useCourt.ts          # SSE 事件 → 状态
    components/CaseImport.tsx  # Markdown 上传、解析模型选择、警告与回填
    data/presets.ts            # 一键剧本与选项
codex-bridge/                  # 可选：把本机 Codex（@openai/codex-sdk）包装成一个 OpenAI 兼容供应商
```

## API 速览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 当前模式（llm / mock）、已就绪供应商数、.env 默认模型 |
| GET | `/api/providers` | 供应商列表（Key 已遮蔽）与预设 |
| POST / PUT / DELETE | `/api/providers[/{id}]` | 新建 / 更新（不传 Key 则保留）/ 删除供应商 |
| POST | `/api/providers/{id}/test` | 连通测试（返回耗时与回复） |
| POST | `/api/providers/{id}/models` | 从供应商拉取模型列表并合并保存 |
| POST | `/api/cases/parse` | 用指定模型解析 Markdown / 纯文本，返回经校验的 `CaseInput` 草稿、法定份额预览与警告 |
| POST | `/api/legal/preview` | 仅计算法定份额（设置页实时预览） |
| POST | `/api/sessions` | 创建会话并立即开庭（含 `default_model` / `executor_model` / 每个成员的 `model` / `discretion` 酌情范围） |
| GET | `/api/sessions/{id}/stream` | SSE 事件流（支持 `?from_seq=` 断线续播） |
| POST | `/api/sessions/{id}/interject` | 幽灵插话 |
| POST | `/api/sessions/{id}/pause` | 下一节点中断，等待续庭 |
| POST | `/api/sessions/{id}/resume` | `Command(resume=…)` 从 Checkpointer 续庭 |
| GET | `/api/sessions/{id}/export` | 导出 Markdown 庭审记录 |

SSE 事件：`session_start` `phase` `agent_status` `speech_start` `speech_delta` `speech_end` `relation` `reaction` `ghost` `notice` `gavel` `verdict` `done`。

## 可选：用本机 Codex 账号当供应商

`codex-bridge/` 用 [`@openai/codex-sdk`](https://github.com/openai/codex/tree/main/sdk/typescript) 跑 Codex，并对外暴露 OpenAI 兼容的 `/v1/chat/completions`，于是 Codex 也能像别的供应商一样分配给任意角色：

```bash
cd codex-bridge && npm install && npm start      # http://127.0.0.1:8787/v1
```

然后在「模型供应商」里选预设 **Codex（本地桥接）**。桥接会在自己的 `.codex-home` 里生成极简配置，只复用 `~/.codex` 的登录凭据与模型供应商设置（不加载 MCP / 插件 / hooks），并内置一个清洗代理，兼容对 Responses 请求体做严格校验的第三方中转。

## 测试

```bash
cd backend && .venv/Scripts/python -m pytest -q     # 规则引擎 + 编排图 + 持久化续庭
cd frontend && npm run build                          # 类型检查 + 打包
```

## 免责声明

本项目给出的是依据《民法典》继承编计算的**参考方案**与一场娱乐化的多 Agent 模拟，不构成法律意见；真实纠纷请咨询律师或通过调解、诉讼解决。
