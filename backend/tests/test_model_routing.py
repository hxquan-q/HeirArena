import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import ModelRef  # noqa: E402
from app.providers import ProviderStore, ProviderUpsert  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402

ENV_SETTINGS = Settings(api_key="sk-env", base_url="https://api.deepseek.com/v1", model="deepseek-chat",
                        temperature=0.9, timeout=5, force_mock=False)


def _store(tmp_path) -> ProviderStore:
    store = ProviderStore(tmp_path / "providers.json")
    store.upsert("codex", ProviderUpsert(name="Codex", base_url="http://127.0.0.1:8787/v1", models=["codex-default"], preset="codex"), MOCK_SETTINGS)
    store.upsert("qwen", ProviderUpsert(name="Qwen", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                                        api_key="sk-qwen", models=["qwen-plus", "qwen-turbo"], preset="qwen"), MOCK_SETTINGS)
    store.upsert("nokey", ProviderUpsert(name="NoKey", base_url="https://example.com/v1", models=["x"], preset="custom"), MOCK_SETTINGS)
    return store


def test_provider_store_persists_and_masks(tmp_path):
    store = _store(tmp_path)
    reloaded = ProviderStore(tmp_path / "providers.json")
    ids = {p.id for p, _ in reloaded.list(MOCK_SETTINGS)}
    assert ids == {"codex", "qwen", "nokey"}
    qwen = reloaded.get("qwen", MOCK_SETTINGS)
    assert qwen.ready and qwen.api_key == "sk-qwen"
    assert reloaded.get("codex", MOCK_SETTINGS).ready, "本地地址无需 Key"
    assert not reloaded.get("nokey", MOCK_SETTINGS).ready
    # 更新时不传 Key 应保留旧 Key
    store.upsert("qwen", ProviderUpsert(name="Qwen2", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", models=["qwen-max"]), MOCK_SETTINGS)
    assert store.get("qwen", MOCK_SETTINGS).api_key == "sk-qwen"
    assert store.get("qwen", MOCK_SETTINGS).name == "Qwen2"


def test_env_provider_is_merged_when_key_present(tmp_path):
    store = ProviderStore(tmp_path / "p.json")
    listed = store.list(ENV_SETTINGS)
    assert listed and listed[0][0].id == "env" and listed[0][1] == "env"
    assert listed[0][0].preset == "deepseek"
    assert store.list(MOCK_SETTINGS) == []


def test_per_role_model_routing(tmp_path):
    store = _store(tmp_path)
    case = sample_case()
    case.default_model = ModelRef(provider_id="qwen", model="qwen-plus")
    case.executor_model = ModelRef(provider_id="codex", model="codex-default")
    by_id = {m.id: m for m in case.members}
    by_id["son"].model = ModelRef(provider_id="mock")                      # 明确走剧本
    by_id["daughter"].model = ModelRef(provider_id="qwen", model="qwen-turbo")
    by_id["ex"].model = ModelRef(provider_id="nokey", model="x")          # 没有 Key → 回退剧本
    by_id["cat_agent"].model = ModelRef(provider_id="codex")              # 未指定模型 → 取供应商第一个

    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS, store)
    orch = Orchestrator(session)

    assert orch.clients["executor"].model == "codex-default"
    assert orch.clients["wife"].model == "qwen-plus"        # 跟随默认
    assert orch.clients["son"] is None
    assert orch.clients["daughter"].model == "qwen-turbo"
    assert orch.clients["ex"] is None
    assert orch.clients["cat_agent"].model == "codex-default"
    assert orch.clients["cat_agent"].api_key == ""

    specs = {a.id: a for a in session.specs}
    assert specs["son"].model_label == "剧本模式" and specs["son"].llm is False
    assert specs["daughter"].model_label == "Qwen · qwen-turbo" and specs["daughter"].llm is True
    assert orch.any_llm and orch.model_summary.endswith("个模型混合")


def test_env_default_used_when_nothing_assigned(tmp_path):
    case = sample_case()
    session = build_session(case, compute_legal_shares(case), ENV_SETTINGS, ProviderStore(tmp_path / "p.json"))
    orch = Orchestrator(session)
    assert all(c is not None and c.model == "deepseek-chat" for c in orch.clients.values())
    assert orch.model_summary == "DeepSeek（.env） · deepseek-chat"


def test_all_mock_when_no_providers(tmp_path):
    case = sample_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS, ProviderStore(tmp_path / "p.json"))
    orch = Orchestrator(session)
    assert not orch.any_llm and orch.model_summary == "scripted"
