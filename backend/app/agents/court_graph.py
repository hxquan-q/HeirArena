"""LangGraph：开庭 → 陈述 → 辩论 → 协商 → 裁决，支持中断恢复。"""
from __future__ import annotations

from typing import Any, Literal

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from typing_extensions import TypedDict


class CourtState(TypedDict, total=False):
    session_id: str
    phase: str
    debate_round: int
    speaker_index: int
    awaiting_intro: bool
    focus: str
    finished: bool


_ORCH_REGISTRY: dict[str, Any] = {}
_GRAPH = None
_CHECKPOINTER = None


def register_orchestrator(orch) -> None:
    _ORCH_REGISTRY[orch.s.id] = orch


def unregister_orchestrator(session_id: str) -> None:
    _ORCH_REGISTRY.pop(session_id, None)


def get_orchestrator(session_id: str):
    orch = _ORCH_REGISTRY.get(session_id)
    if orch is None:
        raise KeyError(f"庭审编排器不存在：{session_id}")
    return orch


def _maybe_pause(orch) -> None:
    if getattr(orch.s, "paused", False):
        interrupt({"phase": orch.s.status, "session_id": orch.s.id, "reason": "paused"})


async def advance(state: CourtState) -> dict:
    orch = get_orchestrator(state["session_id"])
    _maybe_pause(orch)
    return await orch.graph_step(state)


def route(state: CourtState) -> Literal["advance", "__end__"]:
    return END if state.get("finished") else "advance"


def build_court_graph(checkpointer=None):
    return (
        StateGraph(CourtState)
        .add_node("advance", advance)
        .add_edge(START, "advance")
        .add_conditional_edges("advance", route, {"advance": "advance", END: END})
        .compile(checkpointer=checkpointer)
    )


def set_checkpointer(checkpointer) -> None:
    global _CHECKPOINTER, _GRAPH
    _CHECKPOINTER = checkpointer
    _GRAPH = build_court_graph(checkpointer)


def get_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_court_graph(_CHECKPOINTER or InMemorySaver())
    return _GRAPH


def initial_state(session_id: str) -> CourtState:
    return {
        "session_id": session_id,
        "phase": "opening",
        "debate_round": 0,
        "speaker_index": 0,
        "awaiting_intro": True,
        "focus": "",
        "finished": False,
    }


def graph_config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}, "recursion_limit": 80}
