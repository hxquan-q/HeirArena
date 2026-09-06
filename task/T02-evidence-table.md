# T02 · 举证清单静态表

- 阶段：0 确定性层
- 依赖：无
- 范围：后端新文件 `backend/app/legal/evidence.py`、`backend/app/legal/__init__.py` 导出、新测试 `backend/tests/test_seat_evidence.py`
- 规模：S

## 目标

维护一张可审计的静态表：每个"会改变法定份额的杠杆"对应常见证据类型与法条。what-if 沙盘、简报第③节、导出报告都从这里取"需要什么证据"，不由模型现场编造（README 决策：静态表、不做模型补充）。

## 设计依据

README「杠杆边界」；规则引擎可识别的事实见 `backend/app/legal/engine.py`：`main_support`（+0.35）、`cohabit`（+0.15）、`hardship`（+0.35）、`neglect`（×0.4）、`dependency`（继子女视同子女）、`disqualified`（1125）、`deceased`（1128 代位）、`daughter_in_law/son_in_law + main_support`（1129）、`dependent/friend + main_support|hardship`（1131 酌分）、资产 `joint`（1153 析产）。

## 现状锚点

- `backend/app/legal/articles.py`：`ARTICLES`、`ARTICLE_SHORT`，法条编号字符串。
- `backend/app/legal/engine.py`：上述权重常量与判定分支。
- 前端 `frontend/src/lib/evidence.ts` 的 `FACT_META` 是幽灵玩法用的中文标签，可参考措辞，但后端表是独立权威。

## 实施步骤

1. 新建 `backend/app/legal/evidence.py`：

```python
@dataclass(frozen=True)
class EvidenceHint:
    lever: str            # "main_support" | "cohabit" | "hardship" | "neglect" | "dependency" | "disqualified" | "deceased" | "joint" | "inlaw_support" | "dependent_support"
    label: str            # 中文杠杆名
    article: str          # "1130" 等，必须在 ARTICLES 中
    evidence: tuple[str, ...]   # 常见证据类型，3~6 条
    burden: str           # 谁举证、通常由谁反驳，一句话
    note: str = ""        # 弃权提示，如"仅法院可认定丧失继承权"
EVIDENCE_TABLE: dict[str, EvidenceHint]
def hint_for(lever: str) -> EvidenceHint | None
def hints_for_member(member: Member) -> list[EvidenceHint]   # 该成员身份下可能用到的杠杆
```

2. 填表（措辞面向律师与当事人）。示例：`main_support` → 医疗费与护理费票据、护工 / 保姆合同与付款记录、住院陪护记录、居委会或村委会证明、邻居与亲友证人证言、微信转账与聊天记录（1130）；`neglect` → 长期不联系与不探视的证据、拒付赡养费记录、居委会调解记录、被继承人生前书信或录音（1130，注明"通常由主张方举证，被指控方可反证"）；`joint` → 结婚证与购房时间、不动产登记簿、出资来源与银行流水（1153）；`disqualified` → 刑事判决书、伪造篡改遗嘱的鉴定意见，`note="丧失继承权由法院认定，本庭不据此改变份额"`；`deceased` → 死亡证明、户籍注销证明（1128）；`dependency` → 共同生活年限、抚养费支出、学校与医院记录（1127）；`inlaw_support`（丧偶儿媳 / 女婿，1129）与 `dependent_support`（被扶养人 / 扶养较多的人，1131）单列。
3. `backend/app/legal/__init__.py` 导出 `EVIDENCE_TABLE, hint_for, hints_for_member`。

## 验收标准

1. 表内每条 `article` 都存在于 `ARTICLES`。
2. 规则引擎会读取的每个布尔杠杆（`main_support cohabit hardship neglect dependency disqualified deceased` 与资产 `joint`）在表中都有条目。
3. 每条 `evidence` 至少 3 项、`burden` 非空。
4. `hints_for_member` 对 `spouse` 包含 `joint`、对 `daughter_in_law` 包含 `inlaw_support`、对 `dependent` 包含 `dependent_support`、对 `pet` 返回空列表。

## 验证命令

```powershell
cd backend; .venv/Scripts/python -m pytest -q tests/test_seat_evidence.py; .venv/Scripts/python -m pytest -q
```

## 边界

不改规则引擎；不做任何模型调用；不改前端 `lib/evidence.ts`。
