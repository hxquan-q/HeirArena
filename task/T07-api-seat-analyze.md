# T07 · 接口 `POST /api/seat/analyze`

- 阶段：0 确定性层
- 依赖：T03 T04 T05 T06
- 范围：后端 `backend/app/main.py`、`backend/app/seat/analysis.py` 的组装函数、新测试 `backend/tests/test_seat_api.py`
- 规模：S

## 目标

一个不依赖模型、毫秒级返回的接口，把 T03–T05 的确定性产物组装成前端第 IV 卷实时需要的东西：可达区间、what-if 列表、举证清单、推断诉求、博弈表、矩阵的数值列、警告。它是"没接入模型也能入局"的基础。

## 设计依据

README「结束与交付」降级运行；「诉求」可达区间实时警告；「博弈层」。

## 现状锚点

- `backend/app/main.py`：`legal_preview(case: CaseInput)` 是同类"只算不存"的接口范式；`HTTPException(422, …)` 的错误处理写法见 `parse_case`。
- `compute_legal_shares` 已从 `.legal` 导出。

## 实施步骤

1. 在 `analysis.py` 增加 `analyze(case: CaseInput) -> SeatAnalysis`，其中新增 pydantic 模型（放 `models.py` 或 `seat/analysis.py` 均可，前端需要类型，建议 `models.py`）：

```python
class SeatAnalysis(BaseModel):
    player_id: str
    legal: dict                      # LegalResult.model_dump()
    reachability: Reachability
    whatif: list[WhatIfDelta]
    evidence_checklist: list[dict]   # EvidenceHint 的 dataclass → dict
    inferred_goals: dict[str, Goals] # 仅对手；玩家已有 goals 时不含玩家
    game: GameTables
    matrix: list[MatrixRow]          # 只填数值列：baseline_pct reachable target_assets conflicts_with_player potential_allies no_legal_share_reason；strategy_summary 留空、threat_level 用规则粗估
    warnings: list[str]
```

   - `goals` 的合成顺序：`case.seat.goals` 中 `source="user"` 的优先，其余用 `infer_all_goals`。
   - `matrix` 每行：`baseline_pct` 取法定份额；`reachable` 对每位成员各算一次 `reachability(case, member_id)`；`conflicts_with_player` = 与玩家 `target_assets` 交集；`potential_allies` = 联盟表中该成员是玩家的 `potential_confirmers`；`no_legal_share_reason` 取 `LegalResult.shares[].notes[0]`（不 eligible 时）；`threat_level` 规则：与玩家争同一件不可分资产且 `can_absorb` → high；有交集 → medium；无交集但有份额 → low；无份额 → none。
   - `warnings`：`min_value_share > reachability.high` 时加"即使 …，也只到 x%，y% 不现实"；玩家无法定份额时加"你不是法定继承人：…"。
2. `main.py` 新增 `@app.post("/api/seat/analyze")`，入参 `CaseInput`（必须带 `seat`，否则 422 "缺少席位配置"），返回 `analyze(case).model_dump()`。
3. 不做任何持久化、不调模型。

## 验收标准

1. 预设案件 + `seat={player_id: 女儿}` 返回 200，`reachability.legal_pct` 等于 `legal_preview` 中该成员份额。
2. 不带 `seat` → 422。`player_id` 为宠物 → 422（来自 T01 校验）。
3. `min_value_share=90` 时 `warnings` 含"不现实"字样。
4. 响应能被 `SeatAnalysis.model_validate` 反解析（字段完整）。
5. 用 `fastapi.testclient.TestClient` 测，不启动 lifespan 里的续庭逻辑（参考现有 `test_model_routing.py` 对 app 的用法；若需要，用 `app.router.lifespan_context` 的现有 fixture 方式）。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_api.py; .venv/Scripts/python -m pytest -q
```

## 边界

不实现 `/api/seat/strategy`（T10）；不改 `create_session`（T20）。
