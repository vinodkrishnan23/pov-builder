"""G9: every query builder reproduces its spec pattern exactly when given the placeholder
tokens (and default limits); omitted optional conditions are pruned. GENERATED - do not edit."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.db import queries

SPEC: dict[str, Any] = json.loads(Path(__file__).with_name("query_patterns.spec.json").read_text())


def test_qp_1_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "tenant_id": "<tenantId>",
        "start_date": "<optionalStartDate>",
        "page_size": "<pageSize>",
    }
    assert queries.qp_1(**kwargs) == SPEC["QP-1"]


def test_qp_1_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "page_size": "<pageSize>"}
    built = json.dumps(queries.qp_1(**kwargs))
    for token in ["<optionalStartDate>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_2_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "tenant_id": "<tenantId>",
        "start_date": "<optionalStartDate>",
        "page_size": "<pageSize>",
    }
    assert queries.qp_2(**kwargs) == SPEC["QP-2"]


def test_qp_2_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "page_size": "<pageSize>"}
    built = json.dumps(queries.qp_2(**kwargs))
    for token in ["<optionalStartDate>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_3_matches_spec() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>"}
    assert queries.qp_3(**kwargs) == SPEC["QP-3"]


def test_qp_4_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "query_embedding": "<queryEmbedding>",
        "num_candidates": "<numCandidates>",
        "top_k": "<topK>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
        "document_ids": "<optionalDocumentIds>",
        "user_id": "<optionalUserId>",
        "group_ids": "<optionalGroupIds>",
    }
    assert queries.qp_4(**kwargs) == SPEC["QP-4"]


def test_qp_4_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {
        "query_embedding": "<queryEmbedding>",
        "num_candidates": "<numCandidates>",
        "top_k": "<topK>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
    }
    built = json.dumps(queries.qp_4(**kwargs))
    for token in ["<optionalDocumentIds>", "<optionalUserId>", "<optionalGroupIds>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_5_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "query_text": "<queryText>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
        "metadata_filters": "<optionalMetadataFilters>",
        "document_scope_filters": "<optionalDocumentScopeFilters>",
        "top_k": "<topK>",
    }
    assert queries.qp_5(**kwargs) == SPEC["QP-5"]


def test_qp_5_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {
        "query_text": "<queryText>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
        "top_k": "<topK>",
    }
    built = json.dumps(queries.qp_5(**kwargs))
    for token in ["<optionalMetadataFilters>", "<optionalDocumentScopeFilters>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_6_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "query_embedding": "<queryEmbedding>",
        "num_candidates": "<numCandidates>",
        "top_k": "<topK>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
        "memory_type": "<optionalMemoryType>",
        "user_id": "<userId>",
        "group_ids": "<groupIds>",
    }
    assert queries.qp_6(**kwargs) == SPEC["QP-6"]


def test_qp_6_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {
        "query_embedding": "<queryEmbedding>",
        "num_candidates": "<numCandidates>",
        "top_k": "<topK>",
        "tenant_id": "<tenantId>",
        "chunk_profile_id": "<chunkProfileId>",
        "user_id": "<userId>",
        "group_ids": "<groupIds>",
    }
    built = json.dumps(queries.qp_6(**kwargs))
    for token in ["<optionalMemoryType>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_7_matches_spec() -> None:
    kwargs: dict[str, Any] = {"document_id": "<documentId>", "chunk_profile_id": "<chunkProfileId>"}
    assert queries.qp_7(**kwargs) == SPEC["QP-7"]


def test_qp_8_matches_spec() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "page_size": "<pageSize>"}
    assert queries.qp_8(**kwargs) == SPEC["QP-8"]


def test_qp_9_matches_spec() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "benchmark_run_id": "<benchmarkRunId>"}
    assert queries.qp_9(**kwargs) == SPEC["QP-9"]


def test_qp_10_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "tenant_id": "<tenantId>",
        "benchmark_run_id": "<benchmarkRunId>",
        "query_id": "<queryId>",
    }
    assert queries.qp_10(**kwargs) == SPEC["QP-10"]


def test_qp_11_matches_spec() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "benchmark_run_id": "<benchmarkRunId>"}
    assert queries.qp_11(**kwargs) == SPEC["QP-11"]


def test_qp_12_matches_spec() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "benchmark_run_id": "<benchmarkRunId>"}
    assert queries.qp_12(**kwargs) == SPEC["QP-12"]


def test_qp_13_matches_spec() -> None:
    kwargs: dict[str, Any] = {
        "tenant_id": "<tenantId>",
        "start_date": "<optionalStartDate>",
        "page_size": "<pageSize>",
    }
    assert queries.qp_13(**kwargs) == SPEC["QP-13"]


def test_qp_13_prunes_omitted_optionals() -> None:
    kwargs: dict[str, Any] = {"tenant_id": "<tenantId>", "page_size": "<pageSize>"}
    built = json.dumps(queries.qp_13(**kwargs))
    for token in ["<optionalStartDate>"]:
        assert token not in built
    for token in kwargs.values():
        assert token in built


def test_qp_14_matches_spec() -> None:
    kwargs: dict[str, Any] = {"benchmark_run_id": "<benchmarkRunId>", "tenant_id": "<tenantId>"}
    assert queries.qp_14(**kwargs) == SPEC["QP-14"]
