"""Shared annotated types that remove the most common ObjectId / datetime runtime errors."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, cast

from pydantic import AfterValidator, BeforeValidator, PlainSerializer, StringConstraints

OBJECT_ID_PATTERN = r"^[0-9a-fA-F]{24}$"

# API-facing ObjectId: always a 24-hex string, validated at the edge (bad input -> 400).
ObjectIdStr = Annotated[str, StringConstraints(pattern=OBJECT_ID_PATTERN)]


def _object_id_to_str(value: Any) -> Any:
    """Accept bson.ObjectId (from the driver) or a 24-hex string without importing bson here."""
    if value is None or isinstance(value, str):
        return value
    if type(value).__name__ == "ObjectId":
        return str(value)
    return value


# DB-facing ObjectId in document models: driver ObjectIds are normalised to hex strings so
# services never handle bson types; repositories convert back when writing.
PyObjectId = Annotated[
    str,
    BeforeValidator(_object_id_to_str),
    StringConstraints(pattern=OBJECT_ID_PATTERN),
]


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


# Datetimes read from MongoDB are UTC; this normalises any naive value defensively.
UtcDatetime = Annotated[
    datetime,
    AfterValidator(_ensure_utc),
    # JSON responses only: python-mode dumps keep real datetimes so MongoDB stores BSON dates.
    PlainSerializer(
        lambda value: value.isoformat().replace("+00:00", "Z"), return_type=str, when_used="json"
    ),
]


def _normalise_bson(value: Any) -> Any:
    """Recursively turn driver ObjectIds into hex strings (no bson import outside app/db)."""
    if type(value).__name__ == "ObjectId":
        return str(value)
    if isinstance(value, dict):
        mapping = cast(dict[Any, Any], value)
        return {str(key): _normalise_bson(item) for key, item in mapping.items()}
    if isinstance(value, list | tuple):
        sequence = cast(list[Any], value)
        return [_normalise_bson(item) for item in sequence]
    return value


# Free-form values (contract `object` / `array` / untyped) that may contain ObjectIds from MongoDB.
AnyJson = Annotated[Any, BeforeValidator(_normalise_bson)]


def coerce_int(value: Any) -> Any:
    """Query strings arrive as text; integer enums (Literal[3, 4]) need an int before matching."""
    if isinstance(value, str) and value.strip().lstrip("+-").isdigit():
        return int(value.strip())
    return value


def utc_now() -> datetime:
    return datetime.now(UTC)
