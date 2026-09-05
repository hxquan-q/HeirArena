import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents import Orchestrator, build_session  # noqa: E402
from app.agents.llm import extract_json  # noqa: E402
from app.agents.mock import is_dog  # noqa: E402
from app.config import Settings  # noqa: E402
from app.legal import compute_legal_shares  # noqa: E402
from app.models import Asset, CaseInput, Member  # noqa: E402
from tests.test_orchestrator_mock import MOCK_SETTINGS, sample_case  # noqa: E402


def test_extract_json_handles_code_fences_and_prose():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('裁决如下：{"action": "attack", "target": null} 以上。') == {"action": "attack", "target": None}
    assert extract_json("没有 JSON") is None
    assert extract_json('{"broken": ') is None
    assert extract_json('{"story":"这项争议 } 尚未解决","ok":true}') == {
        "story": "这项争议 } 尚未解决",
        "ok": True,
    }


async def _fake_stream(chunks):
    for c in chunks:
        yield c
        await asyncio.sleep(0)


def test_speak_splits_speech_and_meta_marker(monkeypatch):
    case = sample_case()
    session = build_session(case, compute_legal_shares(case), MOCK_SETTINGS)
    orch = Orchestrator(session)

    async def no_sleep(self, seconds):  # noqa: ARG001
        await asyncio.sleep(0)

    monkeypatch.setattr(Orchestrator, "_sleep", no_sleep)

    # 模拟大模型把 "---" 分隔符和 JSON 拆在多个 token 里返回
    chunks = ["王大宝，你五年", "没回家，第113", "0条说得清楚。", "\n-", "--\n{\"action\": \"att", "ack\", \"target\": \"son\", ",
              "\"emoji\": \"😤\", \"claims\": {\"house\": 60, \"nope\": 1}}"]
    turn = asyncio.run(orch._speak("daughter", "debate", 1, _fake_stream(chunks), expect_meta=True))

    assert turn.text == "王大宝，你五年没回家，第1130条说得清楚。"
    assert turn.meta["action"] == "attack"
    assert turn.meta["target"] == "son"
    assert turn.meta["claims"] == {"house": 60.0}  # 未知资产 id 被过滤
    deltas = "".join(e["text"] for e in session.events if e["type"] == "speech_delta")
    assert deltas == turn.text, "分隔符之后的内容不应流给前端"


def test_meta_normalization_rejects_bad_values():
    case = sample_case()
    orch = Orchestrator(build_session(case, compute_legal_shares(case), MOCK_SETTINGS))
    meta = orch._normalize_meta("son", {"action": "nuke", "target": "son", "claims": "x", "emoji": None})
    assert meta == {"action": "propose", "target": None, "emoji": "🙂", "claims": {}, "admissions": []}


def test_settings_mode_detection():
    assert Settings("", "u", "m", 0.9, 5, False).mode == "mock"
    assert Settings("sk-x", "u", "m", 0.9, 5, False).mode == "llm"
    assert Settings("sk-x", "u", "m", 0.9, 5, True).mode == "mock"


def test_pet_kind_detection():
    dog = Member(id="d", name="旺财", relation="pet")
    cat = Member(id="c", name="大橘", relation="pet")
    assets_dog = [Asset(id="p", name="柴犬旺财", type="pet", value=1)]
    assets_cat = [Asset(id="p", name="橘猫大橘", type="pet", value=1)]
    assert is_dog(dog, assets_dog) is True
    assert is_dog(cat, assets_cat) is False
    assert is_dog(Member(id="x", name="小汪", relation="pet"), []) is True
    # 用例最小化：CaseInput 仍可正常构造
    CaseInput(decedent_name="x", assets=assets_dog, members=[dog])
