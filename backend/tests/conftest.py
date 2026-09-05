from pathlib import Path

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Use a repo-local temp dir so Windows runs avoid AppData permission errors."""
    if config.option.basetemp is None:
        base = Path(__file__).resolve().parents[1] / "tmp" / "pytest"
        base.mkdir(parents=True, exist_ok=True)
        config.option.basetemp = str(base)
