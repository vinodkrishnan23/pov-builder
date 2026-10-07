"""G10 (opt-in): seed synthesized documents, create real indexes (incl. vector search),
and execute every query pattern against MongoDB/Atlas. GENERATED - do not edit."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from pymongo import AsyncMongoClient

from app.db.indexes import ensure_indexes, wait_for_search_indexes
from app.db.repositories import Repositories
from tests.integration.synth import synthesize

URI = os.environ.get("BE_TEST_MONGODB_URI", "")
DATABASE = os.environ.get("BE_TEST_DATABASE", "be_agent_scratch")
DIMENSIONS = int(os.environ.get("VECTOR_DIMENSIONS", "1024"))
START = datetime(2025, 1, 1, tzinfo=UTC)
END = datetime(2027, 1, 1, tzinfo=UTC)
SCHEMA: dict[str, Any] = json.loads(Path(__file__).with_name("schema.json").read_text())

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not URI, reason="BE_TEST_MONGODB_URI not set"),
]


async def test_query_patterns_execute_against_mongodb() -> None:
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(URI, tz_aware=True, tzinfo=UTC)
    db = client[DATABASE]
    data = synthesize(SCHEMA, DIMENSIONS)
    for name, documents in data.items():
        await db[name].drop()
        await db[name].insert_many(documents)
    await ensure_indexes(db, DIMENSIONS)
    assert await wait_for_search_indexes(db, 180)
    repos = Repositories(db)

    def sample_value(collection: str, path: str) -> Any:
        value: Any = data[collection][0]
        for part in path.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        if isinstance(value, list):  # scalar compared with an array field: use one element
            value = value[0] if value else None
        return str(value) if value is not None and type(value).__name__ == "ObjectId" else value

    sample_vector = next(
        (
            doc[path]
            for name, path in SCHEMA["vector_paths"].items()
            for doc in data[name]
            if doc.get(path)
        ),
        [0.0] * DIMENSIONS,
    )
    rows = await repos.documents.run_qp_1(
        tenant_id=sample_value("documents", "tenant_id"), page_size=5
    )
    assert isinstance(rows, list), "QP-1"
    rows = await repos.documents.run_qp_2(
        tenant_id=sample_value("documents", "tenant_id"), page_size=5
    )
    assert isinstance(rows, list), "QP-2"
    rows = await repos.chunk_profiles.run_qp_3(
        tenant_id=sample_value("chunk_profiles", "tenant_id")
    )
    assert isinstance(rows, list), "QP-3"
    rows = await repos.chunks.run_qp_4(
        query_embedding=sample_vector,
        num_candidates=100,
        top_k=5,
        tenant_id=sample_value("chunks", "tenant_id"),
        chunk_profile_id=sample_value("chunks", "chunk_profile_id"),
    )
    assert isinstance(rows, list), "QP-4"
    rows = await repos.chunks.run_qp_5(
        query_text="example",
        tenant_id=sample_value("chunks", "tenant_id"),
        chunk_profile_id=sample_value("chunks", "chunk_profile_id"),
        top_k=5,
    )
    assert isinstance(rows, list), "QP-5"
    rows = await repos.chunks.run_qp_6(
        query_embedding=sample_vector,
        num_candidates=100,
        top_k=5,
        tenant_id=sample_value("chunks", "tenant_id"),
        chunk_profile_id=sample_value("chunks", "chunk_profile_id"),
        user_id=sample_value("documents", "access.user_ids"),
        group_ids=[],
    )
    assert isinstance(rows, list), "QP-6"
    rows = await repos.chunks.run_qp_7(
        document_id=sample_value("chunks", "document_id"),
        chunk_profile_id=sample_value("chunks", "chunk_profile_id"),
    )
    assert isinstance(rows, list), "QP-7"
    rows = await repos.benchmark_runs.run_qp_8(
        tenant_id=sample_value("benchmark_runs", "tenant_id"), page_size=5
    )
    assert isinstance(rows, list), "QP-8"
    rows = await repos.queries.run_qp_9(
        tenant_id=sample_value("queries", "tenant_id"),
        benchmark_run_id=sample_value("queries", "benchmark_run_id"),
    )
    assert isinstance(rows, list), "QP-9"
    rows = await repos.query_results.run_qp_10(
        tenant_id=sample_value("query_results", "tenant_id"),
        benchmark_run_id=sample_value("query_results", "benchmark_run_id"),
        query_id=sample_value("query_results", "query_id"),
    )
    assert isinstance(rows, list), "QP-10"
    rows = await repos.query_results.run_qp_11(
        tenant_id=sample_value("query_results", "tenant_id"),
        benchmark_run_id=sample_value("query_results", "benchmark_run_id"),
    )
    assert isinstance(rows, list), "QP-11"
    rows = await repos.query_results.run_qp_12(
        tenant_id=sample_value("query_results", "tenant_id"),
        benchmark_run_id=sample_value("query_results", "benchmark_run_id"),
    )
    assert isinstance(rows, list), "QP-12"
    rows = await repos.queries.run_qp_13(
        tenant_id=sample_value("queries", "tenant_id"), page_size=5
    )
    assert isinstance(rows, list), "QP-13"
    rows = await repos.benchmark_runs.run_qp_14(
        benchmark_run_id=sample_value("benchmark_runs", "_id"),
        tenant_id=sample_value("benchmark_runs", "tenant_id"),
    )
    assert isinstance(rows, list), "QP-14"
    for name in data:
        await db[name].drop()
    await client.close()
