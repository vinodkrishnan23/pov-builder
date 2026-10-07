"""Synthesize documents from the data model for integration tests (template code)."""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId

DOCS_PER_COLLECTION = 24


def _value(
    name: str, spec: dict[str, Any], index: int, rng: random.Random, dims: int, vector: bool
) -> Any:
    kind = str(spec.get("type", "string"))
    if spec.get("enum"):
        options = spec["enum"]
        return options[index % len(options)]
    if kind in {"objectId", "objectid"}:
        return ObjectId()
    if kind in {"date", "datetime"}:
        return datetime(2026, 1, 1, tzinfo=UTC) + timedelta(hours=index * 7)
    if kind in {"bool", "boolean"}:
        return index % 2 == 0
    if kind in {"number", "double", "decimal"}:
        return round(rng.random(), 4)
    if kind in {"int", "integer", "long"}:
        return index
    if kind == "array":
        if vector:
            raw = [rng.gauss(0, 1) for _ in range(dims)]
            norm = math.sqrt(sum(x * x for x in raw)) or 1.0
            return [x / norm for x in raw]
        item = str(spec.get("item_type", "")).lower()
        if item == "objectid":
            return [ObjectId()]
        if item in {"int", "integer", "long"}:
            return [index, index + 1]
        if item in {"double", "number", "float"}:
            return [round(rng.random(), 4)]
        if item in {"string", "str"}:
            return [f"{name}-{index:03d}"]
        return []
    if kind == "document":
        return {
            key: _value(key, child, index, rng, dims, False)
            for key, child in spec.get("fields", {}).items()
        }
    if kind == "object":
        return {}
    return f"{name}-{index:03d}"


def synthesize(schema: dict[str, Any], dims: int) -> dict[str, list[dict[str, Any]]]:
    rng = random.Random(42)  # noqa: S311 - deterministic test data
    data: dict[str, list[dict[str, Any]]] = {}
    vector_paths: dict[str, str] = schema.get("vector_paths", {})
    for collection, fields in schema["collections"].items():
        documents: list[dict[str, Any]] = []
        for index in range(DOCS_PER_COLLECTION):
            document: dict[str, Any] = {}
            for name, spec in fields.items():
                if name == "_id":
                    document["_id"] = ObjectId()
                    continue
                if not spec.get("required") and index % 4 == 3:
                    continue  # leave some optional fields absent
                document[name] = _value(
                    name, spec, index, rng, dims, vector_paths.get(collection) == name
                )
            documents.append(document)
        data[collection] = documents
    # wire references (e.g. support_tickets.assigned_team_id -> support_teams._id)
    for ref, target in schema.get("references", {}).items():
        source, _, path = ref.partition(".")
        targets = [doc["_id"] for doc in data.get(target, []) if "_id" in doc]
        if not targets:
            continue
        for index, document in enumerate(data.get(source, [])):
            parts = path.split(".")
            holder: Any = document
            for part in parts[:-1]:
                holder = holder.get(part) if isinstance(holder, dict) else None
            if isinstance(holder, dict) and parts[-1] in holder:
                holder[parts[-1]] = targets[index % len(targets)]
    # keep timestamps consistent: anything named *resolved_at/*end* after created_at
    for documents in data.values():
        for document in documents:
            created = document.get("created_at")
            if isinstance(created, datetime):
                for key in list(document):
                    if (
                        key != "created_at"
                        and key.endswith("_at")
                        and isinstance(document[key], datetime)
                    ):
                        document[key] = created + timedelta(hours=3 + len(key))
    return data
