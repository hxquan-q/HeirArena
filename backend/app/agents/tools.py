"""角色 / 执行官 Agent 读取案情、发言记录、法定份额的工具。"""
from __future__ import annotations

from contextvars import ContextVar
from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool

if TYPE_CHECKING:
    from .orchestrator import Orchestrator

_ORCH: ContextVar[Any] = ContextVar("heirarena_orch")


def bind_orchestrator(orch: Orchestrator):
    return _ORCH.set(orch)


def reset_orchestrator(token) -> None:
    _ORCH.reset(token)


def current_orch() -> Orchestrator:
    return _ORCH.get()


@tool
def get_case_facts() -> str:
    """读取本案遗产清单、剧情背景和出席人员。需要引用资产、人物或剧情时先调用。"""
    return current_orch().case_facts_text()


@tool
def get_transcript(limit: int = 14) -> str:
    """读取最近的庭审发言记录。limit 为条数，默认 14。回应他人或引用刚才的话时调用。"""
    return current_orch()._transcript_block(limit)


@tool
def get_legal_shares() -> str:
    """读取规则引擎算出的法定参考份额、适用顺序与法条依据。讨论继承权或份额时调用。"""
    return current_orch().legal_shares_text()


COURT_TOOLS = [get_case_facts, get_transcript, get_legal_shares]
