"""模型供应商注册表：任何 OpenAI 兼容接口都可以接入，配置持久化在 backend/data/providers.json。"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .config import Settings

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "providers.json"
LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal")


class ProviderPreset(BaseModel):
    id: str
    name: str
    base_url: str
    models: list[str]
    hint: str = ""
    needs_key: bool = True


PRESETS: list[ProviderPreset] = [
    ProviderPreset(id="codex", name="Codex（本地桥接 · 用你的 Codex 账号）", base_url="http://127.0.0.1:8787/v1",
                   models=["codex-default"], needs_key=False,
                   hint="先运行 codex-bridge：cd codex-bridge && npm install && npm start；它复用 ~/.codex 的登录与模型配置"),
    ProviderPreset(id="deepseek", name="DeepSeek", base_url="https://api.deepseek.com/v1",
                   models=["deepseek-chat", "deepseek-reasoner"], hint="platform.deepseek.com 创建 API Key"),
    ProviderPreset(id="qwen", name="通义千问（DashScope）", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                   models=["qwen-plus", "qwen-turbo", "qwen-max", "qwen3-235b-a22b"], hint="阿里云百炼控制台获取 Key"),
    ProviderPreset(id="moonshot", name="Moonshot Kimi", base_url="https://api.moonshot.cn/v1",
                   models=["kimi-k2-0711-preview", "moonshot-v1-8k", "moonshot-v1-32k"], hint="platform.moonshot.cn"),
    ProviderPreset(id="zhipu", name="智谱 GLM", base_url="https://open.bigmodel.cn/api/paas/v4",
                   models=["glm-4-flash", "glm-4-plus", "glm-4.5"], hint="open.bigmodel.cn"),
    ProviderPreset(id="doubao", name="火山方舟 · 豆包", base_url="https://ark.cn-beijing.volces.com/api/v3",
                   models=["doubao-seed-1-6-250615", "doubao-1-5-pro-32k-250115"], hint="模型名填接入点 ID 或模型 ID"),
    ProviderPreset(id="siliconflow", name="硅基流动 SiliconFlow", base_url="https://api.siliconflow.cn/v1",
                   models=["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-7B-Instruct"], hint="cloud.siliconflow.cn"),
    ProviderPreset(id="openai", name="OpenAI", base_url="https://api.openai.com/v1",
                   models=["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"], hint="platform.openai.com"),
    ProviderPreset(id="openrouter", name="OpenRouter", base_url="https://openrouter.ai/api/v1",
                   models=["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "google/gemini-2.0-flash-001"], hint="一把 Key 调所有模型"),
    ProviderPreset(id="ollama", name="Ollama（本地）", base_url="http://localhost:11434/v1",
                   models=["qwen2.5:7b", "llama3.1:8b", "deepseek-r1:8b"], hint="本地运行，无需 Key", needs_key=False),
    ProviderPreset(id="lmstudio", name="LM Studio（本地）", base_url="http://localhost:1234/v1",
                   models=[], hint="本地运行，无需 Key；点“拉取模型”获取已加载模型", needs_key=False),
    ProviderPreset(id="custom", name="自定义 OpenAI 兼容接口", base_url="https://your-host/v1",
                   models=[], hint="填写以 /v1 结尾的 Base URL"),
]
PRESET_MAP = {p.id: p for p in PRESETS}


class Provider(BaseModel):
    id: str
    name: str
    base_url: str
    api_key: str = ""
    models: list[str] = Field(default_factory=list)
    preset: str = "custom"

    @property
    def is_local(self) -> bool:
        return any(h in self.base_url for h in LOCAL_HOSTS)

    @property
    def ready(self) -> bool:
        return bool(self.api_key) or self.is_local


class ProviderPublic(BaseModel):
    id: str
    name: str
    base_url: str
    models: list[str]
    preset: str
    api_key_set: bool
    api_key_hint: str
    ready: bool
    source: str  # file | env


class ProviderUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    base_url: str = Field(min_length=4, max_length=300)
    api_key: Optional[str] = Field(default=None, description="留空/不传则保留原有 Key")
    models: list[str] = Field(default_factory=list)
    preset: str = "custom"


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:4]}…{key[-4:]}"


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "provider"


def to_public(p: Provider, source: str = "file") -> ProviderPublic:
    return ProviderPublic(
        id=p.id, name=p.name, base_url=p.base_url, models=p.models, preset=p.preset,
        api_key_set=bool(p.api_key), api_key_hint=mask_key(p.api_key), ready=p.ready, source=source,
    )


class ProviderStore:
    def __init__(self, path: Path = DATA_PATH):
        self.path = path
        self._lock = threading.Lock()
        self._items: dict[str, Provider] = {}
        self._load()

    # ------------------------------------------------------------ persistence
    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        for item in raw.get("providers", []):
            try:
                p = Provider(**item)
            except Exception:  # noqa: BLE001
                continue
            self._items[p.id] = p

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"providers": [p.model_dump() for p in self._items.values()]}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")

    # -------------------------------------------------------------- env merge
    @staticmethod
    def env_provider(settings: Settings) -> Provider | None:
        if not settings.api_key:
            return None
        host = re.sub(r"^https?://", "", settings.base_url).split("/")[0]
        preset = next((p.id for p in PRESETS if p.base_url.rstrip("/") == settings.base_url.rstrip("/")), "custom")
        name = PRESET_MAP[preset].name if preset != "custom" else host
        return Provider(id="env", name=f"{name}（.env）", base_url=settings.base_url, api_key=settings.api_key,
                        models=[settings.model], preset=preset)

    # -------------------------------------------------------------------- API
    def list(self, settings: Settings) -> list[tuple[Provider, str]]:
        with self._lock:
            items = [(p, "file") for p in self._items.values()]
        env = self.env_provider(settings)
        if env and "env" not in self._items:
            items.insert(0, (env, "env"))
        return items

    def get(self, provider_id: str, settings: Settings) -> Provider | None:
        with self._lock:
            p = self._items.get(provider_id)
        if p:
            return p
        if provider_id == "env":
            return self.env_provider(settings)
        return None

    def upsert(self, provider_id: str | None, body: ProviderUpsert, settings: Settings) -> Provider:
        with self._lock:
            pid = provider_id or slugify(body.name)
            if not provider_id:
                base, i = pid, 2
                while pid in self._items:
                    pid = f"{base}-{i}"
                    i += 1
            existing = self._items.get(pid) or (self.env_provider(settings) if pid == "env" else None)
            api_key = body.api_key if body.api_key else (existing.api_key if existing else "")
            models = [m.strip() for m in body.models if m and m.strip()]
            p = Provider(id=pid, name=body.name.strip(), base_url=body.base_url.strip().rstrip("/"),
                         api_key=api_key.strip(), models=list(dict.fromkeys(models)), preset=body.preset or "custom")
            self._items[pid] = p
            self._save()
            return p

    def set_models(self, provider_id: str, models: list[str], settings: Settings) -> Provider | None:
        p = self.get(provider_id, settings)
        if not p:
            return None
        with self._lock:
            p = p.model_copy(update={"models": list(dict.fromkeys(models))})
            self._items[provider_id] = p
            self._save()
        return p

    def delete(self, provider_id: str) -> bool:
        with self._lock:
            if provider_id not in self._items:
                return False
            del self._items[provider_id]
            self._save()
            return True
