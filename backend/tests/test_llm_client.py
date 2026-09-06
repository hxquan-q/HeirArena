import asyncio
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.llm import LLMClient, LLMError  # noqa: E402


def _client_with(transport: httpx.MockTransport) -> LLMClient:
    client = LLMClient("http://127.0.0.1:8787/v1", "", "codex-default", timeout=60, label="Codex · codex-default")
    client._http = lambda timeout=None: httpx.AsyncClient(transport=transport, timeout=timeout or client.timeout)  # type: ignore[method-assign]
    return client


def _raising(exc_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc_factory(request)

    return httpx.MockTransport(handler)


async def _drain(client: LLMClient) -> str:
    return "".join([chunk async for chunk in client.stream([{"role": "user", "content": "hi"}])])


def test_complete_timeout_names_limit_and_model():
    client = _client_with(_raising(lambda req: httpx.ReadTimeout("", request=req)))
    with pytest.raises(LLMError) as info:
        asyncio.run(client.complete([{"role": "user", "content": "hi"}]))
    message = str(info.value)
    assert "超时" in message
    assert "60" in message
    assert "Codex · codex-default" in message
    assert "LLM_TIMEOUT" in message


def test_stream_timeout_names_limit_and_model():
    client = _client_with(_raising(lambda req: httpx.ReadTimeout("", request=req)))
    with pytest.raises(LLMError) as info:
        asyncio.run(_drain(client))
    message = str(info.value)
    assert "超时" in message
    assert "60" in message


def test_network_error_without_detail_still_names_the_cause():
    client = _client_with(_raising(lambda req: httpx.ConnectError("", request=req)))
    with pytest.raises(LLMError) as info:
        asyncio.run(client.complete([{"role": "user", "content": "hi"}]))
    message = str(info.value)
    assert message.rstrip().endswith(":") is False
    assert "ConnectError" in message
    assert "http://127.0.0.1:8787/v1" in message
