from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    api_key: str
    base_url: str
    model: str
    temperature: float
    timeout: float
    force_mock: bool

    @property
    def llm_enabled(self) -> bool:
        return bool(self.api_key) and not self.force_mock

    @property
    def mode(self) -> str:
        return "llm" if self.llm_enabled else "mock"


def get_settings() -> Settings:
    return Settings(
        api_key=os.getenv("LLM_API_KEY", "").strip(),
        base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.9")),
        timeout=float(os.getenv("LLM_TIMEOUT", "60")),
        force_mock=os.getenv("FORCE_MOCK", "").lower() in {"1", "true", "yes"},
    )
