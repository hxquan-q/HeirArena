import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CaseInput, Goals, RedLine, SeatConfig  # noqa: E402
from tests.seat_fixtures import cat_case, seated  # noqa: E402


def test_case_without_seat_still_validates():
    case = cat_case()
    assert case.seat is None
    CaseInput.model_validate(case.model_dump())


def test_legal_seat_passes():
    case = seated("daughter", {"daughter": Goals(source="user", target_assets=["album"], narrative="想留相册")})
    assert case.seat is not None
    assert case.seat.player_id == "daughter"
    assert CaseInput.model_json_schema()["properties"]["seat"]


def test_player_cannot_be_pet_or_missing_or_deceased():
    with pytest.raises(ValidationError):
        seated("cat_agent")
    with pytest.raises(ValidationError):
        seated("nobody")
    payload = cat_case().model_dump()
    for member in payload["members"]:
        if member["id"] == "daughter":
            member["deceased"] = True
    payload["seat"] = {"player_id": "daughter", "goals": {}}
    with pytest.raises(ValidationError):
        CaseInput.model_validate(payload)


def test_unknown_target_asset_rejected():
    with pytest.raises(ValidationError):
        seated("daughter", {"daughter": Goals(source="user", target_assets=["nope"])})


def test_custom_red_line_requires_text():
    with pytest.raises(ValidationError):
        RedLine(kind="custom")
    with pytest.raises(ValidationError):
        RedLine(kind="no_sell_asset", asset_id="house", text="不该有")
    RedLine(kind="custom", text="不接受当庭辱骂")


def test_extra_field_forbidden():
    with pytest.raises(ValidationError):
        Goals(source="user", mystery=1)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        SeatConfig(player_id="daughter", extra=True)  # type: ignore[call-arg]
