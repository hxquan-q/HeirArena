"""多 Agent 听证会编排器：开庭 → 陈述 → 若干轮辩论 → 协商 → 裁决。"""
from __future__ import annotations

import asyncio
import json
import random
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from ..config import Settings
from ..legal.articles import ARTICLE_SHORT
from ..models import Asset, CaseInput, LegalResult, Member
from .allocator import (
    Allocation, allocate, default_preferences, member_value, settle_compensations, value_shares,
)
from .llm import LLMClient, LLMError, extract_json
from .mock import (
    BYSTANDER, EXEC_NEGOTIATION, EXEC_OPENING, EXEC_ROUND, EXEC_VERDICT, FOCUS_POOL, REACTION_TO,
    MockContext, mock_speech,
)
from .personas import AVAILABLE_ARTICLES, EXECUTOR_ID, AgentSpec, build_agent_specs, persona_prompt

PHASES = ["opening", "statements", "debate", "negotiation", "verdict"]
MAX_DISCRETION = 15.0  # 裁决相对法定份额最多偏移的百分点


@dataclass
class Turn:
    turn_id: str
    agent_id: str
    name: str
    phase: str
    round_no: int
    text: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class Session:
    id: str
    case: CaseInput
    legal: LegalResult
    specs: list[AgentSpec]
    settings: Settings
    created_at: float = field(default_factory=time.time)
    events: list[dict] = field(default_factory=list)
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    interjections: list[str] = field(default_factory=list)
    transcript: list[Turn] = field(default_factory=list)
    claims: dict[str, dict[str, float]] = field(default_factory=dict)
    relations: list[dict] = field(default_factory=list)
    verdict: dict | None = None
    status: str = "running"
    task: asyncio.Task | None = None

    def emit(self, etype: str, payload: dict[str, Any]) -> None:
        evt = {"seq": len(self.events), "type": etype, "ts": round(time.time(), 3), **payload}
        self.events.append(evt)
        for q in list(self.subscribers):
            q.put_nowait(evt)


class Orchestrator:
    def __init__(self, session: Session):
        self.s = session
        self.case = session.case
        self.legal = session.legal
        self.settings = session.settings
        self.llm = LLMClient(session.settings) if session.settings.llm_enabled else None
        self.rng = random.Random(session.id)
        self.members = {m.id: m for m in self.case.members}
        self.specs = {a.id: a for a in session.specs}
        self.legal_percent = {sh.member_id: sh.percent for sh in self.legal.shares}
        self.prefs = default_preferences(self.case.members, self.case.assets)
        self.last_attacker: dict[str, str] = {}
        self.stats = {"turns": 0, "attacks": 0, "alliances": 0, "concessions": 0, "proposals": 0, "ghost": 0}

    # ------------------------------------------------------------------ helpers
    @property
    def debaters(self) -> list[Member]:
        heirs = sorted(
            [m for m in self.case.members if self.legal_percent.get(m.id, 0) > 0],
            key=lambda m: -self.legal_percent.get(m.id, 0),
        )
        others = [m for m in self.case.members if self.legal_percent.get(m.id, 0) <= 0
                  and m.relation not in {"pet", "ai_twin"} and not m.deceased]
        tail = [m for m in self.case.members if m.relation in {"pet", "ai_twin"}]
        return heirs + others + tail

    def _delay(self, seconds: float) -> float:
        return seconds / max(self.case.speed, 0.25)

    async def _sleep(self, seconds: float) -> None:
        await asyncio.sleep(self._delay(seconds))

    def _status(self, agent_id: str, status: str) -> None:
        self.s.emit("agent_status", {"agent_id": agent_id, "status": status})

    def _drain_interjections(self) -> str | None:
        if not self.s.interjections:
            return None
        text = "；".join(self.s.interjections)
        self.s.interjections.clear()
        return text

    # ------------------------------------------------------------- speech core
    async def _speak(self, agent_id: str, phase: str, round_no: int, gen: AsyncIterator[str],
                     expect_meta: bool, meta_override: dict | None = None) -> Turn:
        turn = Turn(turn_id=uuid.uuid4().hex[:10], agent_id=agent_id, name=self.specs[agent_id].name,
                    phase=phase, round_no=round_no)
        self._status(agent_id, "speaking")
        self.s.emit("speech_start", {"turn_id": turn.turn_id, "agent_id": agent_id, "phase": phase, "round": round_no})
        pending = ""
        meta_buf = ""
        in_meta = False
        marker = "---"

        def flush(text: str) -> None:
            if text:
                turn.text += text
                self.s.emit("speech_delta", {"turn_id": turn.turn_id, "agent_id": agent_id, "text": text})

        async for chunk in gen:
            if in_meta:
                meta_buf += chunk
                continue
            pending += chunk
            if expect_meta:
                idx = pending.find(marker)
                if idx >= 0:
                    flush(pending[:idx].rstrip("\n "))
                    meta_buf = pending[idx + len(marker):]
                    pending = ""
                    in_meta = True
                    continue
                if len(pending) > 4:
                    flush(pending[:-4])
                    pending = pending[-4:]
            else:
                flush(pending)
                pending = ""
        if not in_meta:
            flush(pending)

        meta = meta_override or (extract_json(meta_buf) if meta_buf else None) or {}
        turn.meta = self._normalize_meta(agent_id, meta)
        self.s.transcript.append(turn)
        self.stats["turns"] += 1
        self.s.emit("speech_end", {"turn_id": turn.turn_id, "agent_id": agent_id, "text": turn.text, "meta": turn.meta,
                                   "phase": phase, "round": round_no})
        self._status(agent_id, "idle")
        return turn

    def _normalize_meta(self, agent_id: str, meta: dict) -> dict:
        action = str(meta.get("action") or "").lower()
        if action not in {"attack", "ally", "propose", "concede", "plead"}:
            action = "propose"
        target = meta.get("target")
        if target not in self.specs or target == agent_id:
            target = None
        claims_raw = meta.get("claims") or {}
        claims: dict[str, float] = {}
        if isinstance(claims_raw, dict):
            for k, v in claims_raw.items():
                if k in {a.id for a in self.case.assets}:
                    try:
                        claims[k] = max(0.0, min(100.0, float(v)))
                    except (TypeError, ValueError):
                        continue
        emoji = str(meta.get("emoji") or "🙂")[:4]
        return {"action": action, "target": target, "emoji": emoji, "claims": claims}

    async def _after_speech(self, turn: Turn) -> None:
        meta = turn.meta
        agent_id = turn.agent_id
        if meta.get("claims"):
            self.s.claims.setdefault(agent_id, {}).update(meta["claims"])
            for asset_id, pct in meta["claims"].items():
                row = self.prefs.setdefault(agent_id, {})
                row[asset_id] = max(row.get(asset_id, 0.4), 0.5 + pct / 100)
        action, target = meta.get("action"), meta.get("target")
        self.stats[{"attack": "attacks", "ally": "alliances", "concede": "concessions"}.get(action, "proposals")] += 1
        if target and action in {"attack", "ally"}:
            rel = {"from": agent_id, "to": target, "kind": action, "turn_id": turn.turn_id}
            self.s.relations.append(rel)
            self.s.emit("relation", rel)
            if action == "attack":
                self.last_attacker[target] = agent_id
            await self._sleep(0.3)
            self.s.emit("reaction", {"agent_id": target, "emoji": self.rng.choice(REACTION_TO[action]),
                                     "mood": "angry" if action == "attack" else "happy"})
        # 吃瓜群众
        bystanders = [a for a in self.specs if a not in {agent_id, target, EXECUTOR_ID}]
        if bystanders and self.rng.random() < 0.6:
            who = self.rng.choice(bystanders)
            await self._sleep(0.2)
            self.s.emit("reaction", {"agent_id": who, "emoji": self.rng.choice(BYSTANDER), "mood": "neutral"})

    # -------------------------------------------------------------- generators
    async def _mock_stream(self, text: str) -> AsyncIterator[str]:
        i = 0
        while i < len(text):
            step = self.rng.choice([1, 2, 2, 3])
            yield text[i:i + step]
            i += step
            await self._sleep(0.032)

    async def _llm_stream_or_fallback(self, agent_id: str, messages: list[dict], fallback_text: str) -> tuple[AsyncIterator[str], bool]:
        """返回 (流, 是否为 LLM 流)。LLM 出错时回退到 mock 文本。"""
        if not self.llm:
            return self._mock_stream(fallback_text), False
        try:
            gen = self.llm.stream(messages)
            first = await asyncio.wait_for(gen.__anext__(), timeout=self.settings.timeout)

            async def chained() -> AsyncIterator[str]:
                yield first
                async for c in gen:
                    yield c
            return chained(), True
        except (LLMError, StopAsyncIteration, asyncio.TimeoutError) as e:
            self.s.emit("notice", {"level": "warn", "text": f"{self.specs[agent_id].name} 的模型调用失败，已切换到剧本模式：{str(e)[:120]}"})
            return self._mock_stream(fallback_text), False

    # ------------------------------------------------------------- prompt bits
    def _assets_block(self) -> str:
        lines = []
        for a in self.case.assets:
            flags = []
            if a.joint:
                flags.append("夫妻共同财产")
            if a.sentimental:
                flags.append("有纪念意义")
            if not a.divisible:
                flags.append("不可分割")
            lines.append(f"- [{a.id}] {a.emoji}{a.name}（{a.value:.0f}万元{'，' + '/'.join(flags) if flags else ''}）{a.note}")
        return "\n".join(lines)

    def _people_block(self) -> str:
        lines = []
        for sh in self.legal.shares:
            m = self.members.get(sh.member_id)
            if not m:
                continue
            flags = []
            if m.main_support:
                flags.append("尽主要扶养义务")
            if m.neglect:
                flags.append("有能力不尽义务")
            if m.hardship:
                flags.append("生活困难缺乏劳动能力")
            if m.cohabit:
                flags.append("共同生活")
            if m.deceased:
                flags.append("已过世")
            status = f"法定参考份额 {sh.percent:.1f}%" if sh.eligible else "无继承权"
            lines.append(f"- [{m.id}] {m.name}（{m.label}，{m.personality}型，{status}{'，' + '/'.join(flags) if flags else ''}）：{sh.notes[0] if sh.notes else ''}")
        return "\n".join(lines)

    def _transcript_block(self, limit: int = 14) -> str:
        turns = self.s.transcript[-limit:]
        if not turns:
            return "（尚无人发言）"
        return "\n".join(f"{t.name}（{t.phase}）：{t.text.strip()[:220]}" for t in turns)

    def _debater_messages(self, m: Member, phase: str, round_no: int, interjection: str | None, focus: str | None) -> list[dict]:
        sh = next((x for x in self.legal.shares if x.member_id == m.id), None)
        legal_note = (f"你是法定继承人，法定参考份额 {sh.percent:.1f}%。依据：{'、'.join(sh.notes)}" if sh and sh.eligible
                      else f"你不是法定继承人：{sh.notes[0] if sh and sh.notes else ''}")
        system = (
            f"你是「{m.name}」，{self.case.decedent_name}的{m.label}。这是一场关于{self.case.decedent_name}遗产分配的家庭听证会，"
            f"由遗嘱执行官主持，会以《民法典》继承编为底线做出裁决。\n"
            f"【你的人设】{persona_prompt(m, self.case.decedent_name)}\n"
            f"【你的心愿】{self.specs[m.id].wish}\n"
            f"【剧情背景（大家都知道的事实）】{self.case.story or '无特别说明'}\n"
            f"【你的法律地位】{legal_note}\n"
            f"【遗产清单】\n{self._assets_block()}\n"
            f"【出席人员】\n{self._people_block()}\n"
            f"【发言规则】\n"
            f"1. 第一人称、口语化、有戏剧张力，像家庭剧里的角色；可以尖锐但不要辱骂。80~150 字。\n"
            f"2. 只能引用这些《民法典》条文编号：{AVAILABLE_ARTICLES}，不得编造其它条文。\n"
            f"3. 必须回应前面的发言（点名对方），可以攻击、结盟、让步或提出具体分配方案。\n"
            f"4. 发言结束后另起一行输出 --- ，再输出一行 JSON（不要用代码块）："
            f'{{"action":"attack|ally|propose|concede|plead","target":"对方id或null","emoji":"一个emoji","claims":{{"资产id":想要的百分比}}}}'
        )
        phase_hint = {
            "statements": "现在是开场陈述阶段：说明你想要什么、为什么，亮出你的底牌。",
            "debate": f"现在是第 {round_no} 轮辩论{('，本轮焦点：' + focus) if focus else ''}。回应别人，攻击或结盟，推进你的目标。",
            "negotiation": "现在是最后协商阶段：给出你的最终方案和底线，可以做出让步来换取你最想要的东西。",
        }[phase]
        user = f"{phase_hint}\n\n【此前发言】\n{self._transcript_block()}"
        if interjection:
            user += f"\n\n【突发】天花板上传来{self.case.decedent_name}（亡者本人的幽灵）的声音：“{interjection}”。请先对此做出反应，再继续。"
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def _executor_messages(self, kind: str, extra: str = "") -> list[dict]:
        legal_lines = "\n".join(
            f"- {sh.name}（{sh.relation}）：{sh.percent:.1f}%，依据第{'、'.join(sh.basis)}条；{'；'.join(sh.notes)}"
            for sh in self.legal.shares
        )
        system = (
            f"你是这场家庭遗产听证会的「遗嘱执行官」，中立、克制、带点冷幽默，像一位见过太多家庭闹剧的老法官。"
            f"你必须以《民法典》继承编为底线：法定份额是锚点，只能依据第1130条（多分/少分）、第1131条（酌分）、"
            f"第1132条（协商）在有限范围内调整；宠物是财产不是继承人，可依第1144条附照护义务；不可分割资产按第1156条折价或共有。\n"
            f"被继承人：{self.case.decedent_name}。剧情背景：{self.case.story or '无'}\n"
            f"【遗产清单】\n{self._assets_block()}\n"
            f"【法定参考份额（规则引擎计算）】\n{legal_lines}\n"
            f"【计算说明】\n" + "\n".join(f"- {s}" for s in self.legal.steps) + "\n" + extra
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": kind}]

    # ------------------------------------------------------------------ phases
    async def run(self) -> None:
        s = self.s
        try:
            s.emit("session_start", {
                "session_id": s.id, "mode": self.settings.mode, "model": self.settings.model if self.llm else "scripted",
                "agents": [a.model_dump() for a in s.specs], "legal": self.legal.model_dump(),
                "case": self.case.model_dump(), "article_short": ARTICLE_SHORT,
            })
            await self._opening()
            await self._statements()
            for r in range(1, self.case.rounds + 1):
                await self._debate_round(r)
            await self._negotiation()
            await self._verdict()
            s.status = "done"
            s.emit("done", {"stats": self.stats, "drama_score": self._drama_score()})
        except asyncio.CancelledError:
            s.status = "cancelled"
            raise
        except Exception as e:  # noqa: BLE001
            s.status = "error"
            s.emit("error", {"text": f"编排器异常：{e!r}"})
            raise

    def _drama_score(self) -> int:
        st = self.stats
        return min(100, st["attacks"] * 9 + st["alliances"] * 5 + st["ghost"] * 6 + st["concessions"] * 2 + 20)

    async def _opening(self) -> None:
        self.s.emit("phase", {"phase": "opening", "round": 0, "label": "开庭"})
        self._status(EXECUTOR_ID, "thinking")
        await self._sleep(0.8)
        fallback = self.rng.choice(EXEC_OPENING).format(
            decedent=self.case.decedent_name, estate=f"{self.legal.estate_total:.0f}",
            n_assets=len(self.case.assets), order="一" if self.legal.order_used == 1 else ("二" if self.legal.order_used == 2 else "零"),
        )
        gen, _ = await self._llm_stream_or_fallback(EXECUTOR_ID, self._executor_messages(
            "请做开庭陈述：介绍遗产概况、适用的继承顺序与法定参考份额要点、本场规则。120~180字，不要 JSON。"), fallback)
        await self._speak(EXECUTOR_ID, "opening", 0, gen, expect_meta=False)
        await self._sleep(0.6)

    async def _debater_turn(self, m: Member, phase: str, round_no: int, focus: str | None = None) -> None:
        self._status(m.id, "thinking")
        await self._sleep(0.7)
        interjection = self._drain_interjections()
        if interjection:
            self.stats["ghost"] += 1
        ctx = MockContext(
            me=m, decedent=self.case.decedent_name, story=self.case.story, assets=self.case.assets,
            others=[o for o in self.case.members if o.id != m.id and not o.deceased],
            legal_percent=self.legal_percent, phase=phase, round_no=round_no,
            attacked_me_last=self.last_attacker.pop(m.id, None), rng=self.rng,
            via=next((sh.via for sh in self.legal.shares if sh.member_id == m.id), None),
            interjection=interjection,
        )
        text, meta = mock_speech(ctx, self.prefs.get(m.id))
        if self.llm:
            gen, is_llm = await self._llm_stream_or_fallback(m.id, self._debater_messages(m, phase, round_no, interjection, focus), text)
            turn = await self._speak(m.id, phase, round_no, gen, expect_meta=is_llm, meta_override=None if is_llm else meta)
        else:
            turn = await self._speak(m.id, phase, round_no, self._mock_stream(text), expect_meta=False, meta_override=meta)
        await self._after_speech(turn)
        await self._sleep(0.5)

    async def _statements(self) -> None:
        self.s.emit("phase", {"phase": "statements", "round": 0, "label": "陈述"})
        for m in self.debaters:
            await self._debater_turn(m, "statements", 0)

    async def _debate_round(self, r: int) -> None:
        self.s.emit("phase", {"phase": "debate", "round": r, "label": f"辩论 第{r}轮"})
        top = max(self.case.assets, key=lambda a: a.value) if self.case.assets else None
        focus = self.rng.choice(FOCUS_POOL).format(asset=top.name if top else "遗产")
        self._status(EXECUTOR_ID, "thinking")
        await self._sleep(0.5)
        fallback = self.rng.choice(EXEC_ROUND).format(r=r, focus=focus)
        gen, _ = await self._llm_stream_or_fallback(EXECUTOR_ID, self._executor_messages(
            f"第 {r} 轮辩论开始。请用 40~80 字宣布本轮焦点「{focus}」，可以点评一下上一轮谁说得离谱。不要 JSON。\n\n此前发言：\n{self._transcript_block(8)}"), fallback)
        await self._speak(EXECUTOR_ID, "debate", r, gen, expect_meta=False)
        order = list(self.debaters)
        shift = (r * 2) % max(len(order), 1)
        order = order[shift:] + order[:shift]
        for m in order:
            await self._debater_turn(m, "debate", r, focus)

    async def _negotiation(self) -> None:
        self.s.emit("phase", {"phase": "negotiation", "round": 0, "label": "协商"})
        self._status(EXECUTOR_ID, "thinking")
        await self._sleep(0.5)
        gen, _ = await self._llm_stream_or_fallback(EXECUTOR_ID, self._executor_messages(
            "辩论结束，请宣布进入协商阶段，要求每人给出最终方案与底线。40~70字，不要 JSON。"), self.rng.choice(EXEC_NEGOTIATION))
        await self._speak(EXECUTOR_ID, "negotiation", 0, gen, expect_meta=False)
        for m in self.debaters:
            await self._debater_turn(m, "negotiation", 0)

    # ----------------------------------------------------------------- verdict
    def _bounded_targets(self, proposed: dict[str, float] | None, adjustments: list[dict]) -> dict[str, float]:
        base = {sh.member_id: sh.percent for sh in self.legal.shares if sh.eligible and sh.percent > 0}
        if not base:
            return {}
        targets: dict[str, float] = {}
        for mid, pct in base.items():
            want = pct
            if proposed and mid in proposed:
                try:
                    want = float(proposed[mid])
                except (TypeError, ValueError):
                    want = pct
            targets[mid] = max(0.0, min(100.0, max(pct - MAX_DISCRETION, min(pct + MAX_DISCRETION, want))))
        total = sum(targets.values()) or 1.0
        targets = {k: v * 100 / total for k, v in targets.items()}
        for adj in adjustments:
            adj["delta"] = round(targets.get(adj.get("member_id", ""), 0) - base.get(adj.get("member_id", ""), 0), 1)
        adjustments[:] = [a for a in adjustments if abs(a.get("delta", 0)) >= 0.3]
        return targets

    def _mock_verdict_plan(self) -> tuple[dict[str, float], list[dict], list[str], str]:
        """根据庭审表现给出有限的份额微调：让步的少拿一点，被多方指责的少拿一点，获得支持的多拿一点。"""
        base = {sh.member_id: sh.percent for sh in self.legal.shares if sh.eligible and sh.percent > 0}
        proposed = dict(base)
        reasons: dict[str, list[str]] = {}
        allies: dict[str, set[str]] = {}
        attackers: dict[str, set[str]] = {}
        for t in self.s.transcript:
            action, target = t.meta.get("action"), t.meta.get("target")
            if t.agent_id in proposed and action == "concede" and t.phase == "negotiation":
                proposed[t.agent_id] -= 1.5
                reasons.setdefault(t.agent_id, []).append("协商阶段主动让步（第1132条）")
            if target in proposed and action == "ally":
                allies.setdefault(target, set()).add(t.agent_id)
            if target in proposed and action == "attack":
                attackers.setdefault(target, set()).add(t.agent_id)
        for mid, who in allies.items():
            proposed[mid] += min(1.5, 0.5 * len(who))
            reasons.setdefault(mid, []).append(f"获得 {len(who)} 位出席者支持，主张更具共识")
        for mid, who in attackers.items():
            if len(who) >= 2:
                proposed[mid] -= min(1.5, 0.5 * len(who))
                reasons.setdefault(mid, []).append(f"被 {len(who)} 位出席者指责未尽义务，主张可信度受损")
        adjustments = [
            {"member_id": mid, "reason": "；".join(rs), "article": "1130"} for mid, rs in reasons.items()
        ]
        return proposed, adjustments, [], ""

    def _pet_conditions(self, allocation: Allocation) -> list[str]:
        conds = []
        for a in self.case.assets:
            if a.type != "pet":
                continue
            row = allocation.get(a.id, {})
            if not row:
                continue
            owner = max(row, key=row.get)
            name = self.specs[owner].name if owner in self.specs else owner
            cash = [x for x in self.case.assets if x.type == "cash"]
            fund = f"，并从{cash[0].name}中优先划出 {max(1.0, round(self.legal.estate_total * 0.02, 1))} 万元作为照护基金" if cash else ""
            conds.append(f"{name} 取得 {a.emoji}{a.name} 的同时，须承担终身照护义务{fund}（第1144条 附义务的继承）。")
        return conds

    async def _verdict(self) -> None:
        self.s.emit("phase", {"phase": "verdict", "round": 0, "label": "裁决"})
        self._status(EXECUTOR_ID, "thinking")
        await self._sleep(1.2)

        proposed, adjustments, conditions, rationale = self._mock_verdict_plan()
        citations = sorted({b for sh in self.legal.shares for b in sh.basis} | {"1130", "1132", "1156"})
        speech = ""
        asset_pref: dict[str, str] = {}

        if self.llm:
            claims_txt = "\n".join(
                f"- {self.specs[mid].name} 想要：" + "，".join(f"{self._asset_name(aid)} {pct:.0f}%" for aid, pct in row.items())
                for mid, row in self.s.claims.items() if mid in self.specs
            ) or "（无明确诉求）"
            eligible_ids = ", ".join(f"{mid}({self.specs[mid].name})" for mid in proposed)
            ask = (
                "请作出最终裁决，只输出一个 JSON 对象，字段：\n"
                '{"speech": "裁决词，150~220字，有法条有人情有幽默，最后一句是落槌",\n'
                ' "final_percent": {"成员id": 最终应得遗产净额百分比},  // 只能包含这些有继承权的人：' + eligible_ids + '，合计100，相对法定份额偏移不超过15个百分点\n'
                ' "adjustments": [{"member_id": "id", "reason": "调整理由", "article": "1130"}],\n'
                ' "asset_preferences": {"资产id": "成员id"},  // 不可分割资产（房、车、宠物、收藏品）建议归谁\n'
                ' "conditions": ["附加条件，如宠物照护义务"],\n'
                ' "citations": ["1127", "1130"],\n'
                ' "rationale": "为什么这样分（面向普通人的解释，100字内）"}\n\n'
                f"【各方诉求】\n{claims_txt}\n\n【庭审记录】\n{self._transcript_block(30)}"
            )
            try:
                raw = await self.llm.complete(self._executor_messages(ask), json_mode=True, temperature=0.4)
                data = extract_json(raw) or {}
                if isinstance(data.get("final_percent"), dict):
                    proposed = {k: v for k, v in data["final_percent"].items() if k in proposed}
                if isinstance(data.get("adjustments"), list):
                    adjustments = [a for a in data["adjustments"] if isinstance(a, dict) and a.get("member_id") in self.specs]
                if isinstance(data.get("asset_preferences"), dict):
                    asset_pref = {k: v for k, v in data["asset_preferences"].items()
                                  if k in {a.id for a in self.case.assets} and v in proposed}
                if isinstance(data.get("conditions"), list):
                    conditions = [str(c) for c in data["conditions"]][:6]
                if isinstance(data.get("citations"), list):
                    citations = sorted(set(citations) | {str(c) for c in data["citations"] if str(c) in ARTICLE_SHORT})
                rationale = str(data.get("rationale") or "")
                speech = str(data.get("speech") or "")
            except LLMError as e:
                self.s.emit("notice", {"level": "warn", "text": f"执行官裁决调用失败，使用规则引擎裁决：{str(e)[:120]}"})

        targets = self._bounded_targets(proposed, adjustments)
        prefs = {k: dict(v) for k, v in self.prefs.items()}
        for aid, mid in asset_pref.items():
            prefs.setdefault(mid, {})[aid] = 2.5
        allocation = allocate(self.case, self.legal, targets, prefs)
        compensations = settle_compensations(self.case, self.legal, allocation, targets)
        shares = value_shares(self.case, self.legal, allocation, compensations)
        values = member_value(self.case, allocation, compensations)
        conditions = list(conditions) + self._pet_conditions(allocation)
        if compensations:
            citations = sorted(set(citations) | {"1156"})

        if not speech:
            adj_text = ""
            notable = [a for a in adjustments if abs(a.get("delta", 0)) >= 0.5]
            if notable:
                adj_text = "".join(
                    f"{self.specs[a['member_id']].name}{'多' if a['delta'] > 0 else '少'}分 {abs(a['delta']):.1f} 个百分点，因为{a['reason']}。"
                    for a in notable[:3]
                )
            pets = [a for a in self.case.assets if a.type == "pet"]
            pet_text = (f"{pets[0].name}——它不是继承人，是遗产，但它有资格挑一个对它好的人；" if pets else "剩下的琐碎，")
            speech = self.rng.choice(EXEC_VERDICT).format(adjust_text=adj_text, pet_text=pet_text)
        if not rationale:
            rationale = ("法定份额来自民法典第1127、1130条的确定性计算；庭审中成立的扶养事实与协商让步在 ±15 个百分点内微调；"
                         "不可分割的房、车、宠物、纪念物优先给最在乎它的人，再用存款等可分财产找平，使每人拿到的总价值贴近其应得份额。")

        verdict = {
            "speech": speech,
            "allocation": allocation,
            "compensations": compensations,
            "targets": {k: round(v, 1) for k, v in targets.items()},
            "value_shares": shares,
            "member_value": values,
            "legal_percent": {k: v for k, v in self.legal_percent.items()},
            "adjustments": adjustments,
            "conditions": conditions,
            "citations": citations,
            "rationale": rationale,
            "estate_total": self.legal.estate_total,
            "community_deduction": self.legal.community_deduction,
        }
        self.s.verdict = verdict
        await self._speak(EXECUTOR_ID, "verdict", 0, self._mock_stream(speech), expect_meta=False)
        self.s.emit("gavel", {})
        await self._sleep(0.6)
        self.s.emit("verdict", verdict)

    def _asset_name(self, aid: str) -> str:
        return next((a.name for a in self.case.assets if a.id == aid), aid)


# --------------------------------------------------------------------- factory
def build_session(case: CaseInput, legal: LegalResult, settings: Settings) -> Session:
    percent = {sh.member_id: sh.percent for sh in legal.shares}
    eligible = {sh.member_id: sh.eligible for sh in legal.shares}
    top_assets = "、".join(a.name for a in sorted(case.assets, key=lambda a: -a.value)[:2]) or "遗产"
    specs = build_agent_specs(case.members, percent, eligible, top_assets)
    session = Session(id=uuid.uuid4().hex[:12], case=case, legal=legal, specs=specs, settings=settings)
    return session


def export_markdown(session: Session) -> str:
    c, l = session.case, session.legal
    lines = [f"# {c.decedent_name} 遗产听证会记录", "", f"- 模式：{session.settings.mode}", f"- 遗产净额：{l.estate_total} 万元", ""]
    lines += ["## 法定参考份额", ""]
    for sh in l.shares:
        lines.append(f"- {sh.name}（{sh.relation}）：{sh.percent}%  依据：第{'、'.join(sh.basis)}条  {'；'.join(sh.notes)}")
    lines += ["", "## 庭审记录", ""]
    for t in session.transcript:
        tag = f"[{t.phase}{' R' + str(t.round_no) if t.round_no else ''}]"
        lines.append(f"**{t.name}** {tag}：{t.text.strip()}")
        lines.append("")
    if session.verdict:
        v = session.verdict
        lines += ["## 最终裁决", "", v["speech"], "", "### 分配结果", ""]
        for a in c.assets:
            row = v["allocation"].get(a.id, {})
            parts = "，".join(f"{next((s.name for s in session.specs if s.id == mid), mid)} {pct}%" for mid, pct in row.items())
            lines.append(f"- {a.emoji}{a.name}（{a.value}万元）：{parts}")
        if v.get("compensations"):
            name = {s.id: s.name for s in session.specs}
            lines += ["", "### 折价补偿（第1156条）", ""] + [
                f"- {name.get(c['from'], c['from'])} → {name.get(c['to'], c['to'])}：{c['amount']} 万元" for c in v["compensations"]
            ]
        lines += ["", "### 为什么这样分", "", v["rationale"], ""]
        if v["conditions"]:
            lines += ["### 附加条件", ""] + [f"- {x}" for x in v["conditions"]] + [""]
        lines += ["### 法条依据", ""] + [f"- 第{cid}条 {ARTICLE_SHORT.get(cid, '')}" for cid in v["citations"]]
    return "\n".join(lines)


__all__ = ["Orchestrator", "Session", "Turn", "build_session", "export_markdown", "json"]
