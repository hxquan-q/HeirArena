from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_DATA_DIR = _BACKEND_DIR / "data"
load_dotenv(_BACKEND_DIR / ".env")


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


@dataclass(frozen=True)
class Settings:
    api_key: str
    base_url: str
    model: str
    temperature: float
    timeout: float
    force_mock: bool
    data_dir: Path = _DATA_DIR
    database_url: str = ""
    checkpoint_path: Path = _DATA_DIR / "checkpoints.db"
    cors_origins: tuple[str, ...] = ()

    @property
    def llm_enabled(self) -> bool:
        return bool(self.api_key) and not self.force_mock

    @property
    def mode(self) -> str:
        return "llm" if self.llm_enabled else "mock"


def get_settings() -> Settings:
    data_dir = Path(os.getenv("HEIRARENA_DATA_DIR", str(_DATA_DIR)))
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = Path(os.getenv("HEIRARENA_DB", str(data_dir / "heirarena.db")))
    cors_origins = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    )
    return Settings(
        api_key=os.getenv("LLM_API_KEY", "").strip(),
        base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.9")),
        timeout=float(os.getenv("LLM_TIMEOUT", "60")),
        force_mock=os.getenv("FORCE_MOCK", "").lower() in {"1", "true", "yes"},
        data_dir=data_dir,
        database_url=os.getenv("DATABASE_URL", _sqlite_url(db_path)),
        checkpoint_path=Path(os.getenv("HEIRARENA_CHECKPOINTS", str(data_dir / "checkpoints.db"))),
        cors_origins=cors_origins,
    )
