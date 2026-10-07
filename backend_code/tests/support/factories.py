"""Build schema-valid example values from type annotations / Pydantic models (template code)."""

from __future__ import annotations

import types
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Union, get_args, get_origin

from pydantic import BaseModel
from pydantic.fields import FieldInfo

EXAMPLE_DATETIME = datetime(2026, 1, 15, 12, 0, tzinfo=UTC)
OBJECT_ID = "65a1b2c3d4e5f60718293a4b"
DATETIME_TYPES = {"AwareDatetime", "NaiveDatetime", "PastDatetime", "FutureDatetime"}


def _pattern(metadata: list[Any]) -> str | None:
    for item in metadata:
        pattern = getattr(item, "pattern", None)
        if isinstance(pattern, str):
            return pattern
    return None


def example_for(annotation: Any, metadata: list[Any] | None = None) -> Any:
    metadata = list(metadata or [])
    origin = get_origin(annotation)
    if origin is Annotated:
        base, *extra = get_args(annotation)
        return example_for(base, metadata + list(extra))
    if annotation is Any or annotation is object:
        return "value"
    if origin is Literal:
        return get_args(annotation)[0]
    if origin in (Union, types.UnionType):
        options = [arg for arg in get_args(annotation) if arg is not type(None)]
        return example_for(options[0], metadata) if options else None
    if origin in (list, tuple, set, frozenset):
        args = get_args(annotation)
        return [example_for(args[0])] if args else []
    if origin is dict:
        return {}
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return build_model(annotation)
    if annotation is bool:
        return True
    if annotation is int:
        return 1
    if annotation is float:
        return 1.5
    if annotation is datetime or getattr(annotation, "__name__", "") in DATETIME_TYPES:
        return EXAMPLE_DATETIME
    if annotation is str:
        return OBJECT_ID if _pattern(metadata) else "example"
    if annotation is type(None):
        return None
    return "example"


def _field_example(field: FieldInfo) -> Any:
    return example_for(field.annotation, list(field.metadata))


def build_payload(model: type[BaseModel]) -> dict[str, Any]:
    """Example payload (by alias) with every field populated."""
    payload: dict[str, Any] = {}
    for name, field in model.model_fields.items():
        payload[field.alias or name] = _field_example(field)
    return payload


def build_model(model: type[BaseModel]) -> BaseModel:
    return model.model_validate(build_payload(model))


def to_json_payload(model: type[BaseModel]) -> dict[str, Any]:
    return build_model(model).model_dump(mode="json", by_alias=True)
