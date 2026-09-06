import os
import tempfile
from pathlib import Path

import pytest

collect_ignore = ["tmp"]


def pytest_configure(config: pytest.Config) -> None:
    """Use a per-process system temp dir so Windows file locks from a
    previous run cannot block pytest's session-start rmtree of a shared folder."""
    if config.option.basetemp is None:
        base = Path(tempfile.gettempdir()) / "heirarena-pytest" / f"run-{os.getpid()}"
        base.mkdir(parents=True, exist_ok=True)
        config.option.basetemp = str(base)
