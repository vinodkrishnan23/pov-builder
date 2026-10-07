"""Repository helpers shared by the generated repositories (driver code lives only in app/db)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any, TypeVar, cast

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, ValidationError
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.errors import DuplicateKeyError

from app.api_error import DataShapeMismatch, DuplicateKeyConflict, InvalidRequest

logger = logging.getLogger("app.db")

Document = dict[str, Any]
QueryRow = dict[str, Any]
ModelT = TypeVar("ModelT", bound=BaseModel)

MAX_FIND_RESULTS = 1000


def to_object_id(value: str) -> ObjectId:
    """Convert an API-facing hex string to ObjectId; invalid input is a 400, never a crash."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError) as error:
        raise InvalidRequest(f"Invalid ObjectId: {value!r}") from error


def _convert_path(node: Any, segments: list[str]) -> Any:
    """Convert the value(s) at `segments` (`a.b`, `a[].b`, `ids[]`) from hex strings to ObjectId."""
    if not segments:
        return to_object_id(node) if isinstance(node, str) else node
    head, rest = segments[0], segments[1:]
    if not isinstance(node, dict):
        return node
    container = cast(dict[str, Any], node)
    key = head[:-2] if head.endswith("[]") else head
    if key not in container:
        return container
    value: object = container[key]
    if head.endswith("[]"):
        if not isinstance(value, list):
            return container
        items = cast(list[Any], value)
        converted: Any = [
            _convert_path(item, rest) if rest else _convert_path(item, []) for item in items
        ]
    else:
        converted = _convert_path(value, rest)
    return {**container, key: converted}


def convert_object_ids(document: Document, paths: Sequence[str]) -> Document:
    """Return a copy with hex-string ObjectId fields converted to ObjectId.

    Paths are dotted; `[]` marks arrays, e.g. `tenant_id`, `access.user_ids[]`, `results[].chunk_id`.
    """
    result: Any = dict(document)
    for path in paths:
        result = _convert_path(result, path.split("."))
    return cast(Document, result)


def validate_document(model: type[ModelT], raw: Document, collection: str) -> ModelT:
    """Validate a stored document; shape problems become DATA_SHAPE_MISMATCH (500) with context."""
    try:
        return model.model_validate(raw)
    except ValidationError as error:
        fields = [".".join(str(part) for part in item["loc"]) for item in error.errors()]
        logger.error("data shape mismatch in %s: %s", collection, fields)
        raise DataShapeMismatch(details={"collection": collection, "fields": fields}) from error


class BaseRepository:
    """Thin typed wrapper around one collection."""

    collection_name: str = ""

    def __init__(self, collection: AsyncCollection[Document]) -> None:
        self.collection = collection

    async def _aggregate(self, pipeline: list[dict[str, Any]]) -> list[QueryRow]:
        cursor = await self.collection.aggregate(pipeline)
        return [row async for row in cursor]

    async def _find(
        self,
        filter_: dict[str, Any],
        projection: dict[str, Any] | None = None,
        sort: list[tuple[str, int]] | None = None,
        limit: int = MAX_FIND_RESULTS,
    ) -> list[QueryRow]:
        cursor = self.collection.find(filter_, projection)
        if sort:
            cursor = cursor.sort(sort)
        cursor = cursor.limit(limit)
        return [row async for row in cursor]

    async def _insert(self, document: Document) -> None:
        try:
            await self.collection.insert_one(document)
        except DuplicateKeyError as error:
            details: dict[str, Any] = dict(error.details or {})
            key_value: object = details.get("keyValue")
            key = cast(dict[str, Any], key_value) if isinstance(key_value, dict) else None
            raise DuplicateKeyConflict(key) from error
