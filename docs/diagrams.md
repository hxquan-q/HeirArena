# HeirArena · 图表

本文图表以当前仓库代码为准；尚未实现的能力统一标为“规划中”。当前只支持 Markdown / 纯文本案情导入，不包含 OCR、RAG 或图数据库。

## 1. 五步玩家旅程

当前可用的是 Director（旁观导演 / 逝者幽灵）模式：玩家建案后观看 Agent 庭审，收集证据、预测与押注，并消耗能量施放显灵技能。Role-play（角色扮演）分支仍在规划中。

```mermaid
flowchart LR
    A["1 建案<br/>选择剧本、手工录入或导入文本"] --> B{"2 入局"}
    B --> C["当前可用：Director 逝者幽灵<br/>证据、押注、显灵技能、休庭或续庭"]
    B -.-> D["规划中：Role-play 角色扮演<br/>选择当事人、私密诉求与利益目标"]
    C --> E["3 博弈<br/>陈述、焦点辩论、结盟、提案与让步"]
    D -.-> E
    E --> F["4 裁决<br/>法律基线、有限裁量、资产分配与补偿"]
    F --> G["5 复盘<br/>判决、事实、押注揭晓、论点评估、和解方案"]
    G -.-> H["规划中：个人目标达成度与策略复盘"]
```

实线表示当前已实现链路，虚线表示规划能力。角色 Agent 当前自动发言；玩家尚不能选择某位当事人并直接参与回合。

## 2. 系统架构

前端通过 REST 创建和控制会话，通过 SSE 消费庭审事件。后端把模型表达、LangGraph 编排、确定性法律计算和 SQLite 持久化分开。

```mermaid
flowchart TB
    subgraph Browser["浏览器"]
        Pages["React 页面<br/>大厅、导入、设置、法庭"]
        Stores["Zustand 状态<br/>useCaseDraft、useCourt、useArena"]
        Game["游戏派生层<br/>证据卡、主张预测、阵营、时间线、显灵技能"]
        Pages <--> Stores
        Stores --> Game
        Game --> Pages
    end

    subgraph API["FastAPI"]
        Rest["REST API<br/>案情解析、份额预览、会话控制、导出"]
        Stream["SSE<br/>历史回放与实时事件"]
    end

    subgraph Core["庭审核心"]
        Parser["文本案情解析<br/>LLM 抽取 + Pydantic 与原文引用校验"]
        Legal["确定性法律引擎<br/>法定份额与析产"]
        Graph["LangGraph<br/>庭审阶段与检查点"]
        Orch["Orchestrator<br/>发言、事实归一化、裁决、资产分配"]
        Agents["角色与执行官 Agent<br/>LangChain create_agent"]
        Providers["OpenAI 兼容模型供应商<br/>失败时直连，再回退内置剧本"]
    end

    subgraph Data["本地数据"]
        AppDB["SQLite + SQLModel<br/>案件、绑定、事件、发言、裁决"]
        CheckDB["SQLite Checkpointer<br/>LangGraph 状态"]
        ProviderFile["providers.json<br/>供应商配置"]
    end

    Stores --> Rest
    Stream --> Stores
    Rest --> Parser
    Rest --> Legal
    Rest --> Orch
    Orch <--> Graph
    Orch --> Agents
    Agents --> Providers
    Orch --> Legal
    Orch --> Stream
    Parser --> Providers
    Parser --> Legal
    Orch --> AppDB
    Graph --> CheckDB
    Providers --> ProviderFile
```

案情解析仅接受 UTF-8 的 `.md`、`.markdown` 和 `.txt` 内容。模型不可用时庭审发言可降级到剧本；案情解析本身则要求可用模型。

## 3. LangGraph 庭审状态机

代码中的 LangGraph 只有一个 `advance` 节点循环执行，具体阶段由 `CourtState.phase` 和发言人索引推进；下图展开其业务状态。

```mermaid
stateDiagram-v2
    [*] --> 开庭
    开庭 --> 陈述: 执行官开场
    陈述 --> 陈述: 下一位出席者
    陈述 --> 归纳焦点: 全员陈述完成
    归纳焦点 --> 辩论
    辩论 --> 辩论: 执行官宣布焦点并逐人发言
    辩论 --> 辩论: 进入下一轮
    辩论 --> 协商: 达到设定轮数
    协商 --> 协商: 执行官引导并逐人发言
    协商 --> 裁决: 全员协商完成
    裁决 --> [*]: verdict、done

    note right of 陈述
        每次 advance 前检查 paused
        触发 interrupt 后由 resume
        从同一 thread_id 继续
    end note
```

每次 `advance` 只推进一位发言者或一次阶段切换。休庭标记会在下一节点触发 `interrupt`，续庭通过同一 `thread_id` 的检查点恢复。

## 4. 裁决双路径

LLM 负责表达和提交受限的符号化事实，数值份额始终经过确定性代码计算与边界投影；攻击、结盟、口才和戏剧值不能直接改变份额。

```mermaid
flowchart TB
    Case["已确认案情<br/>人物、资产、法律事实"] --> Base["法律引擎<br/>计算法定份额基线"]
    Speech["LLM 或内置剧本发言"] --> Symbols["符号化事实白名单<br/>admit_neglect<br/>waive_share<br/>acknowledge_support:id"]
    Symbols --> Normalize["确定性校验<br/>本人自认、成员 ID、两人确认、turn_id 溯源"]
    Normalize --> FactPlan["确定性事实计划<br/>成立事实、待确认问题、份额建议"]
    Base --> FactPlan

    FactPlan --> Choice{"执行官模型可用<br/>且裁量大于 0"}
    Choice -->|是| LLMVerdict["LLM 生成裁决表达与建议"]
    Choice -->|否| RuleVerdict["规则裁决兜底"]
    LLMVerdict --> Filter["约束过滤<br/>仅可调整有成立事实的成员<br/>调整必须引用有效 turn_id"]
    RuleVerdict --> Bound
    Filter --> Bound["边界投影<br/>相对基线不超过案件设定的 ±0 至 ±15 个百分点<br/>总和保持 100%"]
    Bound --> Allocate["确定性资产分配与折价补偿"]
    Allocate --> Result["裁决结果<br/>份额、资产、补偿、依据与待确认问题"]

    Drama["攻击、结盟、情绪、戏剧值"] -.-> Show["只影响演出与统计"]
```

执行官模型可以润色判决、提出资产偏好，并在用户设定范围内建议调整；无成立事实的成员会保持法定份额，不合法输出会被过滤或回退。

## 5. SSE、持久化与恢复

同一庭审事件先进入会话内存，同时写入应用数据库并推送订阅队列。浏览器记录最后序号，断线后用 `from_seq` 只补播未消费事件。

```mermaid
flowchart LR
    Step["Orchestrator / LangGraph<br/>推进庭审"] --> Emit["Session.emit<br/>生成 seq、type、ts、payload"]
    Emit --> Memory["Session.events<br/>内存事件列表"]
    Emit --> EventsDB["heirarena.db<br/>court_events"]
    Emit --> Queue["订阅者 Queue"]
    Memory --> Replay["SSE 历史回放<br/>events[from_seq:]"]
    Queue --> Live["SSE 实时推送"]
    Replay --> Source["浏览器 EventSource"]
    Live --> Source
    Source --> Store["useCourt<br/>按 seq 去重并更新界面"]
    Store -.-> Reconnect["断线重连<br/>from_seq = lastSeq + 1"]
    Reconnect --> Replay

    Step --> Snapshot["案件快照、发言、裁决、角色绑定"]
    Snapshot --> AppDB["heirarena.db<br/>cases、speeches、verdicts、role_bindings"]
    Step --> Checkpoint["LangGraph 检查点"]
    Checkpoint --> CheckDB["checkpoints.db"]

    Restart["服务启动或 resume API"] --> Rebuild["从 heirarena.db 重建<br/>Session 与 Orchestrator"]
    AppDB --> Rebuild
    EventsDB --> Rebuild
    Rebuild --> Register["重新注册编排器"]
    CheckDB --> Resume["按 thread_id 读取图状态"]
    Register --> Resume
    Resume --> Step
```

`heirarena.db` 保存可回放的业务数据；`checkpoints.db` 保存 LangGraph 执行位置。启动时只自动重建状态为 `running` 或 `paused` 的案件，运行中的案件会继续推进，暂停案件等待显式续庭。

## 6. 项目目录

下图只列当前仓库中实际存在、与运行或协作直接相关的目录和关键文件。

```mermaid
flowchart TB
    Root["HeirArena 仓库"]
    Root --> GH[".github/workflows<br/>CI"]
    Root --> Assets["assets<br/>角色像素素材"]
    Root --> Backend["backend"]
    Root --> Docs["docs"]
    Root --> Examples["examples<br/>sample-case.md"]
    Root --> Frontend["frontend"]
    Root --> Scripts["start.ps1、start.sh"]
    Root --> Meta["README.md、CONTRIBUTING.md、LICENSE"]

    Backend --> App["app"]
    Backend --> Tests["tests<br/>解析、法律、编排、持久化等测试"]
    Backend --> Req["requirements.txt、.env.example"]
    App --> Main["main.py<br/>FastAPI、REST、SSE"]
    App --> ParserFile["case_parser.py<br/>文本案情抽取与校验"]
    App --> Models["models.py<br/>领域模型"]
    App --> Persist["persist.py<br/>SQLModel 持久化"]
    App --> ProvidersFile["providers.py<br/>模型供应商"]
    App --> AgentsDir["agents<br/>LangGraph、Agent、编排、恢复、分配"]
    App --> LegalDir["legal<br/>法条与确定性规则引擎"]

    Frontend --> Public["public<br/>静态图标"]
    Frontend --> Src["src"]
    Frontend --> Build["package.json、Vite 与 TypeScript 配置"]
    Src --> PagesDir["pages<br/>大厅、导入、设置、法庭"]
    Src --> Components["components<br/>证据、时间线、阵营、预测、场景、UI"]
    Src --> StoreDir["store<br/>草稿、SSE 庭审状态、玩家场次存档"]
    Src --> ApiDir["api<br/>REST 客户端与 SSE 订阅"]
    Src --> DataDir["data<br/>内置剧本与选项"]
    Src --> LibDir["lib<br/>证据、预测、显灵技能、音效"]

    Docs --> Diagrams["diagrams.md<br/>本文"]
    Docs --> Screens["images 与 screenshot 文件<br/>项目截图"]
```

运行时生成的 `backend/data`（数据库和供应商配置）已被忽略，不属于已提交源码；前端构建产物和依赖目录同样未列出。
