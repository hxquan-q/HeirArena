# HeirArena Open-source Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the repository as a pixel-art multi-Agent case strategy sandbox with accurate screenshots, maintainable diagrams, coherent documentation, and a clean merged `main` branch.

**Architecture:** The README acts as the public landing page, while focused product, architecture, and diagram documents provide progressive detail. All claims are checked against the current React/FastAPI/LangGraph implementation; planned player-role strategy features are labeled as roadmap rather than shipped behavior.

**Tech Stack:** Markdown, Mermaid, React 19, Vite 8, FastAPI, LangChain, LangGraph, SQLite/SQLModel, browser screenshots, Git/GitHub.

## Global Constraints

- Use the product name “HeirArena · 遗产竞技场”.
- Lead with “像素风 Web 剧本杀式多 Agent 案件利益沙盘”.
- Distinguish current capabilities from roadmap features.
- Use only real screenshots from the locally running application.
- Keep diagrams editable as Mermaid inside Markdown.
- Do not present simulation output as legal advice or predicted litigation outcome.

---

### Task 1: Capture real product screenshots

**Files:**
- Create: `docs/images/lobby.png`
- Create: `docs/images/case-setup.png`
- Create: `docs/images/courtroom.png`
- Create: `docs/images/verdict.png`

**Interfaces:**
- Consumes: running frontend at `http://localhost:5175` or another verified local Vite URL
- Produces: stable image paths consumed by `README.md` and `docs/product.md`

- [ ] Open the locally running app and verify the page is HeirArena.
- [ ] Capture the lobby at a desktop viewport.
- [ ] Navigate to new-case setup or import and capture the core configuration UI.
- [ ] Start or open a mock-mode court session and capture the voxel courtroom.
- [ ] Let the mock trial reach a verdict and capture the verdict/results panel.
- [ ] Open each saved image and verify it is non-empty, readable, and contains no API key.

### Task 2: Rewrite the public README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: screenshots from Task 1 and links to Tasks 3–4
- Produces: repository landing page for players and contributors

- [ ] Replace the opening with the approved one-sentence product positioning.
- [ ] Add the real lobby/courtroom hero image and a compact four-step screenshot gallery.
- [ ] Explain director mode and the role-play/interest-maximization roadmap without claiming the latter is shipped.
- [ ] Present the five-step game loop and three-layer result model.
- [ ] Keep verified quick-start, provider routing, API summary, tests, license, contribution, and disclaimer details.
- [ ] Link to `docs/product.md`, `docs/architecture.md`, and `docs/diagrams.md`.

### Task 3: Replace conflicting product documentation

**Files:**
- Delete: `docs/EstateGraph-Agent-项目说明文档.md`
- Delete: `docs/EstateGraph-Agent-图表集.md`
- Create: `docs/product.md`

**Interfaces:**
- Consumes: approved design spec and current repository behavior
- Produces: canonical product concept and roadmap

- [ ] Describe audience, problem, product promise, player modes, game loop, result model, current capabilities, and roadmap.
- [ ] Add a “current vs planned” capability table.
- [ ] Explain why legal rules constrain the simulation and why drama cannot directly change statutory shares.
- [ ] Add privacy and legal-disclaimer boundaries appropriate to imported case text.
- [ ] Remove the two EstateGraph documents after migrating only facts that describe current HeirArena behavior.

### Task 4: Document architecture and diagrams

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/diagrams.md`

**Interfaces:**
- Consumes: `backend/app/`, `frontend/src/`, API routes, LangGraph flow, persistence model
- Produces: contributor-facing technical map and GitHub-renderable diagrams

- [ ] Write architecture boundaries for frontend, API/SSE, orchestration, role agents, legal engine, persistence, and model providers.
- [ ] Document failure fallbacks: role agent → OpenAI-compatible direct call → mock script; model verdict → rule verdict.
- [ ] Add Mermaid diagrams for player journey, system architecture, court state machine, verdict dual path, event/data flow, and project structure.
- [ ] Validate diagram labels and edges against actual modules and routes.

### Task 5: Verify and publish

**Files:**
- Modify if needed: documentation files from Tasks 2–4

**Interfaces:**
- Consumes: all documentation and image artifacts
- Produces: clean, pushed `main` and removed merged feature branch

- [ ] Search Markdown for stale `EstateGraph`, absolute local paths, missing screenshot names, and unsupported feature claims.
- [ ] Run `python -m pytest -q` in `backend`; expect all tests to pass.
- [ ] Run `npm run build` in `frontend`; expect TypeScript and Vite build success.
- [ ] Check `git status`, staged diff, and recent commit style.
- [ ] Commit the documentation package with a concise conventional commit message.
- [ ] Push `main` to `origin`.
- [ ] Confirm the feature branch tip is an ancestor/equivalent of `main`, then delete it locally and remotely.
- [ ] Confirm final `git status -sb` reports `main...origin/main` with no changes.
