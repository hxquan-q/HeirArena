import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.court_graph import build_court_graph, set_checkpointer  # noqa: E402
from app.agents.restore import rebuild_orchestrator, rebuild_session  # noqa: E402
from app.agents.tools import bind_orchestrator, get_case_facts, get_legal_shares, get_transcript, reset_orchestrator  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.persist import init_engine, list_resumable_case_ids, load_bindings, load_events, load_speeches, reset_engine  # noqa: E402
from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402


def _init_tmp_db(tmp_path) -> None:
    reset_engine()
    init_engine(f"sqlite:///{(tmp_path / 'heirarena.db').as_posix()}")


def test_tools_read_case_transcript_and_shares():
    case = sample_case()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, MOCK_SETTINGS)
    orch = Orchestrator(session)
    token = bind_orchestrator(orch)
    try:
        facts = get_case_facts.invoke({})
        shares = get_legal_shares.invoke({})
        transcript = get_transcript.invoke({"limit": 5})
    finally:
        reset_orchestrator(token)
    assert "学区房" in facts and "老王" in facts
    assert "李阿姨" in shares and "1127" in shares
    assert "尚无人发言" in transcript


def test_persist_case_events_and_rebuild(tmp_path, monkeypatch):
    _init_tmp_db(tmp_path)
    set_checkpointer(InMemorySaver())
    case = sample_case()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, MOCK_SETTINGS)
    orch = Orchestrator(session)

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)
    asyncio.run(orch.run())

    assert session.status == "done"
    assert session.verdict
    assert load_events(session.id)
    assert load_speeches(session.id)
    rebuilt, extras = rebuild_session(session.id, MOCK_SETTINGS, None)
    assert rebuilt.status == "done"
    assert rebuilt.verdict and rebuilt.verdict["targets"]
    assert {t.agent_id for t in rebuilt.transcript} >= {"executor", "wife", "son"}
    orch2 = rebuild_orchestrator(rebuilt, extras)
    assert orch2.stats["turns"] >= 1


def test_graph_resume_from_checkpoint(tmp_path, monkeypatch):
    _init_tmp_db(tmp_path)
    saver = InMemorySaver()
    set_checkpointer(saver)
    case = sample_case()
    legal = compute_legal_shares(case)
    session = build_session(case, legal, MOCK_SETTINGS)
    orch = Orchestrator(session)

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)

    async def cancel_after_opening():
        task = asyncio.create_task(orch.run())
        for _ in range(200):
            if any(t.phase == "opening" for t in session.transcript):
                task.cancel()
                break
            await asyncio.sleep(0)
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(cancel_after_opening())
    assert any(t.phase == "opening" for t in session.transcript)
    assert session.verdict is None

    session.status = "running"
    asyncio.run(orch.run(resume=True))
    assert session.status == "done"
    assert session.verdict
    types = [e["type"] for e in session.events]
    assert types[0] == "session_start"
    assert types[-1] == "done"
    assert types.count("phase") == 5


def test_court_graph_compiles():
    graph = build_court_graph(InMemorySaver())
    assert graph is not None


def test_resumable_case_list(tmp_path, monkeypatch):
    _init_tmp_db(tmp_path)
    set_checkpointer(InMemorySaver())
    case = sample_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    session.status = "running"
    session.persist_snapshot({})
    assert session.id in list_resumable_case_ids()
    load_bindings(session.id)  # table exists even if empty
