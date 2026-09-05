# Contributing to HeirArena

感谢你对 **HeirArena（遗产竞技场）** 的关注。这是一个把《民法典》继承编规则引擎与 LangGraph 多 Agent 编排结合在一起的**可玩庭审模拟**项目，欢迎 Issue、文档改进与 Pull Request。

## 开发环境

- **Python** 3.10+（后端）
- **Node.js** 20+（前端 Vite 8）
- 可选：任意 OpenAI 兼容 LLM（未配置时自动进入剧本模式）

```bash
# 后端
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # 可选
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
```

也可在仓库根目录运行 `start.ps1`（Windows）或 `start.sh`（macOS / Linux）。

## 提交前自检

```bash
cd backend && python -m pytest -q
cd frontend && npm run build
```

## Pull Request 建议

1. 一个 PR 聚焦一类改动（例如「裁决面板 UI」或「规则引擎边界 case」）。
2. 涉及法律计算逻辑时，请补充或更新 `backend/tests/` 中的用例。
3. 不要提交 `.env`、API Key、`backend/data/` 下的本地数据库，或 `node_modules/` / `dist/`。
4. 文案与注释可使用中文；公开 API 与类型名保持与现有代码一致（英文标识符为主）。

## 报告问题

Issue 中请尽量包含：复现步骤、是否使用 LLM / 剧本模式、浏览器与 Python 版本，以及（如方便）导出的 Markdown 庭审记录片段。

## 免责声明

本仓库输出的是娱乐化模拟与参考计算，**不构成法律意见**。
