"""Focused service tests; no database, network or HTTP app."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Literal, cast

import pytest

from app.api.schemas import (
    HybridSearchDocumentsRequest,
    HybridSearchDocumentsResponse,
    SearchAgentMemoryRequest,
    SearchAgentMemoryResponse,
    VectorSearchDocumentsRequest,
    VectorSearchDocumentsResponse,
)
from app.db.base import QueryRow
from app.db.repositories import Repositories
from app.errors import ChunkProfileNotFound, DocumentNotFound, ValidationError
from app.models.documents import ChunkProfilesDocument, DocumentsDocument
from app.services.chunks import ChunksService

TENANT = "a" * 24
OTHER = "b" * 24
DOCUMENT = "c" * 24
PROFILE = "d" * 24
CHUNK = "e" * 24
QUERY = "f" * 24
NOW = datetime(2025, 1, 1, tzinfo=UTC)
Mode = Literal["vector", "hybrid", "memory"]
SearchResponse = (
    VectorSearchDocumentsResponse | HybridSearchDocumentsResponse | SearchAgentMemoryResponse
)


class FakeDocuments:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.document: DocumentsDocument | None = DocumentsDocument(
            _id=DOCUMENT,
            tenant_id=TENANT,
            document_type="text",
            source_system="upload",
            ingest_status="uploaded",
            is_agent_memory=False,
            created_at=NOW,
            updated_at=NOW,
        )

    async def find_one_by_id(self, value: str) -> DocumentsDocument | None:
        assert value == DOCUMENT
        self.events.append("document")
        return self.document


class FakeProfiles:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.profile: ChunkProfilesDocument | None = ChunkProfilesDocument(
            _id=PROFILE,
            name="recursive",
            strategy="recursive",
            is_active=False,
            created_at=NOW,
        )

    async def find_one_by_id(self, value: str) -> ChunkProfilesDocument | None:
        assert value == PROFILE
        self.events.append("profile")
        return self.profile


class FakeChunks:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.rows: list[QueryRow] = []
        self.bindings: dict[str, object] = {}

    async def run_qp_7(self, **kwargs: object) -> list[QueryRow]:
        self.events.append("qp7")
        self.bindings = kwargs
        return self.rows

    async def run_qp_4(self, **kwargs: object) -> list[QueryRow]:
        self.events.append("qp4")
        self.bindings = kwargs
        return self.rows

    async def run_qp_5(self, **kwargs: object) -> list[QueryRow]:
        self.events.append("qp5")
        self.bindings = kwargs
        return self.rows

    async def run_qp_6(self, **kwargs: object) -> list[QueryRow]:
        self.events.append("qp6")
        self.bindings = kwargs
        return self.rows


class Harness:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.documents = FakeDocuments(self.events)
        self.profiles = FakeProfiles(self.events)
        self.chunks = FakeChunks(self.events)
        self.service = ChunksService(
            cast(
                Repositories,
                SimpleNamespace(
                    documents=self.documents, chunk_profiles=self.profiles, chunks=self.chunks
                ),
            )
        )


async def _search(
    harness: Harness, mode: Mode, overrides: dict[str, object] | None = None
) -> SearchResponse:
    data: dict[str, object] = {
        "query_text": "traceable question",
        "query_embedding": [0.5],
        "chunk_profile_id": PROFILE,
        "user_id": OTHER,
        "top_k": 2,
        "num_candidates": 1,
    }
    data.update(overrides or {})
    if mode == "vector":
        return await harness.service.vector_search_documents(
            body=VectorSearchDocumentsRequest.model_validate(data), tenant_id=TENANT
        )
    if mode == "hybrid":
        return await harness.service.hybrid_search_documents(
            body=HybridSearchDocumentsRequest.model_validate(data), tenant_id=TENANT
        )
    return await harness.service.search_agent_memory(
        body=SearchAgentMemoryRequest.model_validate(data), tenant_id=TENANT
    )


@pytest.mark.parametrize("ownership", ["missing", "other"])
async def test_inspection_requires_owned_document(ownership: str) -> None:
    h = Harness()
    if ownership == "missing":
        h.documents.document = None
    else:
        assert h.documents.document is not None
        h.documents.document.tenant_id = OTHER
    with pytest.raises(DocumentNotFound) as error:
        await h.service.get_document_chunks_by_profile(
            tenant_id=TENANT, document_id=DOCUMENT, chunk_profile_id=PROFILE
        )
    assert error.value.details == {"tenant_id": TENANT, "document_id": DOCUMENT}
    assert h.events == ["document"]


async def test_inspection_mapping_and_empty_results() -> None:
    h = Harness()
    h.chunks.rows = [
        {
            "_id": CHUNK,
            "document_id": DOCUMENT,
            "chunk_index": 1,
            "text": "original",
            "chunk_profile": {"name": "recursive", "strategy": "recursive"},
            "embedding": [1.0],
            "rerank_text": "private",
        },
        {
            "_id": OTHER,
            "document_id": DOCUMENT,
            "chunk_index": 4,
            "text": "next",
            "token_count": 2,
            "char_count": 4,
            "chunk_profile": {
                "name": "recursive",
                "strategy": "recursive",
                "parameters": {"size": 4},
            },
        },
    ]
    response = await h.service.get_document_chunks_by_profile(
        tenant_id=TENANT, document_id=DOCUMENT, chunk_profile_id=PROFILE
    )
    assert h.events == ["document", "qp7"]
    assert h.chunks.bindings == {"document_id": DOCUMENT, "chunk_profile_id": PROFILE}
    assert [item.chunk_index for item in response.chunks] == [1, 4]
    first = response.chunks[0]
    assert first.id == CHUNK and first.document_id == DOCUMENT
    assert first.token_count is None and first.char_count is None
    assert first.chunk_profile.parameters is None
    assert response.chunks[1].chunk_profile.parameters == {"size": 4}
    assert "embedding" not in first.model_dump()
    assert "rerank_text" not in first.model_dump()
    h.chunks.rows = []
    empty = await h.service.get_document_chunks_by_profile(
        tenant_id=TENANT, document_id=DOCUMENT, chunk_profile_id=PROFILE
    )
    assert empty.chunks == []
    assert "profile" not in h.events


@pytest.mark.parametrize("mode", ["vector", "memory"])
async def test_missing_embedding_is_validation_not_generation_failure(mode: Mode) -> None:
    h = Harness()
    with pytest.raises(ValidationError) as error:
        await _search(h, mode, {"query_embedding": None})
    assert error.value.details == {"field": "query_embedding"}
    assert h.events == []


@pytest.mark.parametrize("mode", ["vector", "hybrid", "memory"])
@pytest.mark.parametrize("scope", ["missing", "other"])
async def test_search_profile_not_found(mode: Mode, scope: str) -> None:
    h = Harness()
    if scope == "missing":
        h.profiles.profile = None
    else:
        assert h.profiles.profile is not None
        h.profiles.profile.tenant_id = OTHER
    with pytest.raises(ChunkProfileNotFound) as error:
        await _search(h, mode)
    assert error.value.details == {"tenant_id": TENANT, "chunk_profile_id": PROFILE}
    assert h.events == ["profile"]


@pytest.mark.parametrize("mode", ["vector", "hybrid", "memory"])
@pytest.mark.parametrize("scope", [None, TENANT])
async def test_inactive_tenant_and_global_profiles_allow_empty_search(
    mode: Mode, scope: str | None
) -> None:
    h = Harness()
    assert h.profiles.profile is not None
    h.profiles.profile.tenant_id = scope
    response = await _search(h, mode)
    assert response.query_id is None
    assert response.results == []
    assert h.events == ["profile", {"vector": "qp4", "hybrid": "qp5", "memory": "qp6"}[mode]]
    assert h.chunks.bindings["top_k"] == 2
    if mode == "vector":
        assert h.chunks.bindings["document_ids"] is None
        assert h.chunks.bindings["group_ids"] is None
    if mode == "hybrid":
        assert h.chunks.bindings["metadata_filters"] is None
        assert h.chunks.bindings["document_scope_filters"] is None
    if mode == "memory":
        assert h.chunks.bindings["group_ids"] == []
        assert h.chunks.bindings["memory_type"] is None


@pytest.mark.parametrize(
    "filters",
    [
        {"metadata_filters": {"category": "policy"}},
        {"metadata_filters": {"$match": {"tenant_id": OTHER}}},
        {"document_scope": {"document_ids": [DOCUMENT]}},
        {"document_scope": {"source_systems": ["s3"]}},
        {"document_scope": {"document_ids": []}},
    ],
)
async def test_hybrid_rejects_unrepresentable_restrictions(filters: dict[str, object]) -> None:
    h = Harness()
    with pytest.raises(ValidationError) as error:
        await _search(h, "hybrid", filters)
    assert "clarification" in error.value.message
    assert h.events == []


async def test_hybrid_empty_filter_objects_omit_fragments() -> None:
    h = Harness()
    await _search(h, "hybrid", {"metadata_filters": {}, "document_scope": {}})
    assert h.chunks.bindings["metadata_filters"] is None
    assert h.chunks.bindings["document_scope_filters"] is None


@pytest.mark.parametrize("mode", ["vector", "hybrid", "memory"])
async def test_search_mapping_order_limits_echo_and_bindings(mode: Mode) -> None:
    h = Harness()
    row: QueryRow = {
        "chunk_id": CHUNK,
        "document_id": DOCUMENT,
        "score": 9,
        "text_snippet": "authoritative snippet",
        "document_type": "text",
        "source_system": "upload",
        "created_at": NOW,
        "_id": OTHER,
        "embedding": [0.8],
    }
    h.chunks.rows = [row, {**row, "chunk_id": OTHER, "score": 3}, row]
    overrides: dict[str, object] = {"query_id": QUERY}
    if mode == "vector":
        overrides.update({"document_ids": [DOCUMENT], "group_ids": [TENANT]})
    if mode == "memory":
        overrides.update({"memory_type": "summary", "group_ids": [TENANT]})
    response = await _search(h, mode, overrides)
    assert response.query_id == QUERY
    assert response.retrieval_mode == ("hybrid" if mode == "hybrid" else "vector")
    assert [item.rank for item in response.results] == [1, 2]
    assert [item.score for item in response.results] == [9.0, 3.0]
    assert [item.chunk_id for item in response.results] == [CHUNK, OTHER]
    first = response.results[0]
    assert first.document_id == DOCUMENT
    assert first.text_snippet == "authoritative snippet"
    assert first.source_title is None and first.structured_attributes is None
    dumped = first.model_dump()
    assert "embedding" not in dumped and "_id" not in dumped
    if isinstance(response, VectorSearchDocumentsResponse):
        assert response.results[0].source_system == "upload"
        assert h.chunks.bindings["document_ids"] == [DOCUMENT]
    else:
        assert "source_system" not in dumped
    if isinstance(response, SearchAgentMemoryResponse):
        assert response.results[0].created_at == NOW
        assert h.chunks.bindings["memory_type"] == "summary"
    if mode != "hybrid":
        assert h.chunks.bindings["query_embedding"] == [0.5]
        assert h.chunks.bindings["num_candidates"] == 1
        assert h.chunks.bindings["user_id"] == OTHER
        assert h.chunks.bindings["group_ids"] == [TENANT]
    else:
        assert h.chunks.bindings["query_text"] == "traceable question"
    assert h.chunks.bindings["tenant_id"] == TENANT
    assert h.chunks.bindings["chunk_profile_id"] == PROFILE
