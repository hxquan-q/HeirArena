"""OpenAI 兼容的流式 Chat Completions 客户端（DeepSeek / Qwen / Moonshot / OpenAI / Ollama 均可）。"""
from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import httpx

from ..config import Settings
from ..models import ModelRef

LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"}


class LLMError(RuntimeError):
    pass


class ModelUnavailable(LLMError):
    """指定的模型槽位无法解析为可用的 LLMClient。"""


def repair_messages(
    messages: list[dict[str, str]],
    raw: str,
    error: str,
) -> list[dict[str, str]]:
    return [
        *messages,
        {"role": "assistant", "content": raw[:20_000]},
        {
            "role": "user",
            "content": (
                "上一个 JSON 未通过校验。请只重新输出修正后的完整 JSON 对象；"
                "不要补写原文没有的事实。\n校验错误：\n"
                f"{error[:4_000]}"
            ),
        },
    ]


def resolve_client(
    ref: ModelRef | None,
    settings: Settings,
    providers,
    *,
    temperature: float,
    timeout: float,
    purpose: str,
) -> tuple["LLMClient", str]:
    from ..providers import Provider, ProviderStore

    provider: Provider | None = None
    model = ""
    if ref is not None:
        if ref.is_mock:
            raise ModelUnavailable(f"{purpose}必须选择一个可用模型，不能使用剧本模式")
        provider = providers.get(ref.provider_id, settings)
        if provider is None:
            raise ModelUnavailable(f"{purpose}供应商「{ref.provider_id}」不存在")
        model = ref.model or (provider.models[0] if provider.models else "")
    else:
        env = ProviderStore.env_provider(settings)
        if env is not None and env.ready:
            provider = env
            model = settings.model or (env.models[0] if env.models else "")
        else:
            provider = next(
                (p for p, _source in providers.list(settings) if p.ready and p.models),
                None,
            )
            model = provider.models[0] if provider and provider.models else ""
    if provider is None or not provider.ready or not model:
        raise ModelUnavailable(f"没有可用的{purpose}模型，请先在「模型供应商」中完成配置")
    client = LLMClient(
        provider.base_url,
        provider.api_key,
        model,
        temperature=temperature,
        timeout=timeout,
        label=f"{provider.name} · {model}",
    )
    return client, client.label


def is_local_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in LOCAL_HOSTS or host.endswith(".local")


class LLMClient:
    def __init__(self, base_url: str, api_key: str, model: str, temperature: float = 0.9, timeout: float = 60.0,
                 label: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.timeout = timeout
        self.label = label or model
        # 本机服务（Ollama / LM Studio / codex-bridge）不能走系统代理：Windows 上 httpx 会读取
        # 注册表里的代理设置（如 Clash 127.0.0.1:7897），把 localhost 请求送去代理只会得到一个空 502。
        self.trust_env = not is_local_url(self.base_url)

    def _http(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout or self.timeout, trust_env=self.trust_env)

    def _payload(self, messages: list[dict], stream: bool, json_mode: bool, temperature: float | None) -> dict:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "temperature": self.temperature if temperature is None else temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        return payload

    @property
    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def stream(self, messages: list[dict], temperature: float | None = None) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        try:
            async with self._http() as client:
                async with client.stream(
                    "POST", url, headers=self._headers,
                    json=self._payload(messages, True, False, temperature),
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "ignore")[:300]
                        raise LLMError(f"LLM HTTP {resp.status_code}: {body}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for choice in chunk.get("choices", []):
                            delta = choice.get("delta") or {}
                            content = delta.get("content")
                            if content:
                                yield content
        except httpx.HTTPError as e:
            raise LLMError(f"LLM 网络错误: {e}") from e

    async def complete(self, messages: list[dict], json_mode: bool = False, temperature: float | None = None,
                       max_tokens: int | None = None) -> str:
        url = f"{self.base_url}/chat/completions"
        payload = self._payload(messages, False, json_mode, temperature)
        if max_tokens:
            payload["max_tokens"] = max_tokens
        try:
            async with self._http() as client:
                resp = await client.post(url, headers=self._headers, json=payload)
        except httpx.HTTPError as e:
            raise LLMError(f"LLM 网络错误: {e}") from e
        if resp.status_code >= 400:
            raise LLMError(f"LLM HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError(f"LLM 响应格式异常: {str(data)[:200]}") from e

    async def ping(self) -> dict:
        """最小化连通性测试：一次 8 token 的补全，返回耗时与回复。"""
        started = time.perf_counter()
        reply = await self.complete(
            [{"role": "user", "content": "请只回复两个字母：OK"}], temperature=0.0, max_tokens=8,
        )
        return {"ok": True, "latency_ms": int((time.perf_counter() - started) * 1000), "reply": reply.strip()[:40], "model": self.model}

    async def list_models(self) -> list[str]:
        """GET /models —— 大多数 OpenAI 兼容服务（含 Ollama、LM Studio）都支持。"""
        try:
            async with self._http(min(self.timeout, 20)) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers)
        except httpx.HTTPError as e:
            raise LLMError(f"拉取模型列表失败: {e}") from e
        if resp.status_code >= 400:
            raise LLMError(f"拉取模型列表失败 HTTP {resp.status_code}: {resp.text[:200]}")
        try:
            data = resp.json()
        except ValueError as e:
            raise LLMError("模型列表不是合法 JSON") from e
        items = data.get("data") if isinstance(data, dict) else data
        ids: list[str] = []
        for it in items or []:
            mid = it.get("id") if isinstance(it, dict) else (it if isinstance(it, str) else None)
            if mid:
                ids.append(str(mid))
        return sorted(dict.fromkeys(ids))[:300]


def extract_json(text: str) -> dict | None:
    """从模型输出里尽力捞出第一个 JSON 对象。"""
    text = text.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```JSON").removeprefix("```").strip()
        if text.endswith("```"):
            text = text[:-3].rstrip()
    decoder = json.JSONDecoder()
    # raw_decode 能正确处理 JSON 字符串内部的花括号；逐个尝试可跳过模型输出的前言。
    for start, char in enumerate(text):
        if char != "{":
            continue
        try:
            value, _end = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None
