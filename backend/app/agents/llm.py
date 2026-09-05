"""OpenAI 兼容的流式 Chat Completions 客户端（DeepSeek / Qwen / Moonshot / OpenAI 均可）。"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ..config import Settings


class LLMError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, settings: Settings):
        self.s = settings

    def _payload(self, messages: list[dict], stream: bool, json_mode: bool, temperature: float | None) -> dict:
        payload: dict = {
            "model": self.s.model,
            "messages": messages,
            "stream": stream,
            "temperature": self.s.temperature if temperature is None else temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        return payload

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.s.api_key}", "Content-Type": "application/json"}

    async def stream(self, messages: list[dict], temperature: float | None = None) -> AsyncIterator[str]:
        url = f"{self.s.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.s.timeout) as client:
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

    async def complete(self, messages: list[dict], json_mode: bool = False, temperature: float | None = None) -> str:
        url = f"{self.s.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.s.timeout) as client:
                resp = await client.post(
                    url, headers=self._headers,
                    json=self._payload(messages, False, json_mode, temperature),
                )
        except httpx.HTTPError as e:
            raise LLMError(f"LLM 网络错误: {e}") from e
        if resp.status_code >= 400:
            raise LLMError(f"LLM HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as e:
            raise LLMError(f"LLM 响应格式异常: {str(data)[:200]}") from e


def extract_json(text: str) -> dict | None:
    """从模型输出里尽力捞出第一个 JSON 对象。"""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None
