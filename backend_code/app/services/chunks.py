"""Business logic for the chunks resource."""

from __future__ import annotations

from app.api.schemas import (
    GetDocumentChunksByProfileResponse,
    GetDocumentChunksByProfileResponseChunksItem,
    HybridSearchDocumentsRequest,
    HybridSearchDocumentsResponse,
    HybridSearchDocumentsResponseResultsItem,
    SearchAgentMemoryRequest,
    SearchAgentMemoryResponse,
    SearchAgentMemoryResponseResultsItem,
    VectorSearchDocumentsRequest,
    VectorSearchDocumentsResponse,
    VectorSearchDocumentsResponseResultsItem,
)
from app.db.base import QueryRow
from app.db.repositories import Repositories
from app.errors import ChunkProfileNotFound, DocumentNotFound, ValidationError


def _ranked_row(row: QueryRow, rank: int) -> QueryRow:
    """Convert projected identifiers without changing scores, snippets or order."""
    data: QueryRow = dict(row)
    data["chunk_id"] = str(row["chunk_id"])
    data["document_id"] = str(row["document_id"])
    data["rank"] = rank
    return data


class ChunksService:
    """Read-only inspection and retrieval using QP-4 through QP-7."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def _require_profile(self, *, tenant_id: str, chunk_profile_id: str) -> None:
        profile = await self.repos.chunk_profiles.find_one_by_id(chunk_profile_id)
        if profile is None or profile.tenant_id not in (None, tenant_id):
            raise ChunkProfileNotFound(
                details={"tenant_id": tenant_id, "chunk_profile_id": chunk_profile_id}
            )

    async def get_document_chunks_by_profile(
        self, *, tenant_id: str, document_id: str, chunk_profile_id: str
    ) -> GetDocumentChunksByProfileResponse:
        """QP-7 after ownership pre-read; errors: ValidationError, DocumentNotFound.

        IDs are validated by the route. Empty chunks do not imply a missing document.
        """
        document = await self.repos.documents.find_one_by_id(document_id)
        if document is None or document.tenant_id != tenant_id:
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        rows = await self.repos.chunks.run_qp_7(
            document_id=document_id, chunk_profile_id=chunk_profile_id
        )
        chunks: list[GetDocumentChunksByProfileResponseChunksItem] = []
        for row in rows:
            data: QueryRow = dict(row)
            data["_id"] = str(row["_id"])
            data["document_id"] = str(row["document_id"])
            chunks.append(GetDocumentChunksByProfileResponseChunksItem.model_validate(data))
        return GetDocumentChunksByProfileResponse(chunks=chunks)

    async def vector_search_documents(
        self, *, body: VectorSearchDocumentsRequest, tenant_id: str
    ) -> VectorSearchDocumentsResponse:
        """QP-4; errors: ValidationError, ChunkProfileNotFound, EmbeddingGenerationFailed.

        No embedding generator is available, so missing input is ValidationError.
        query_id is echo-only. Optional access and scope bindings go to the wrapper.
        """
        if body.query_embedding is None:
            raise ValidationError(
                "query_embedding is required because server-side embedding is unavailable.",
                details={"field": "query_embedding"},
            )
        await self._require_profile(tenant_id=tenant_id, chunk_profile_id=body.chunk_profile_id)
        rows = await self.repos.chunks.run_qp_4(
            query_embedding=body.query_embedding,
            num_candidates=body.num_candidates,
            top_k=body.top_k,
            tenant_id=tenant_id,
            chunk_profile_id=body.chunk_profile_id,
            document_ids=body.document_ids,
            user_id=body.user_id,
            group_ids=body.group_ids,
        )
        results: list[VectorSearchDocumentsResponseResultsItem] = [
            VectorSearchDocumentsResponseResultsItem.model_validate(_ranked_row(row, rank))
            for rank, row in enumerate(rows[: body.top_k], start=1)
        ]
        return VectorSearchDocumentsResponse(
            query_id=body.query_id, retrieval_mode="vector", results=results
        )

    async def hybrid_search_documents(
        self, *, body: HybridSearchDocumentsRequest, tenant_id: str
    ) -> HybridSearchDocumentsResponse:
        """QP-5; errors: ValidationError, ChunkProfileNotFound.

        No authoritative fragment adapter exists. Reject populated restrictions,
        rather than inventing Search clauses or silently discarding restrictions.
        """
        if body.metadata_filters:
            raise ValidationError(
                "metadata_filters has no contract-backed Atlas Search translation; clarification is required.",
                details={"field": "metadata_filters"},
            )
        if body.document_scope is not None and (
            body.document_scope.document_ids is not None
            or body.document_scope.source_systems is not None
        ):
            raise ValidationError(
                "document_scope has no contract-backed Atlas Search translation; clarification is required.",
                details={"field": "document_scope"},
            )
        await self._require_profile(tenant_id=tenant_id, chunk_profile_id=body.chunk_profile_id)
        rows = await self.repos.chunks.run_qp_5(
            query_text=body.query_text,
            tenant_id=tenant_id,
            chunk_profile_id=body.chunk_profile_id,
            metadata_filters=None,
            document_scope_filters=None,
            top_k=body.top_k,
        )
        results: list[HybridSearchDocumentsResponseResultsItem] = [
            HybridSearchDocumentsResponseResultsItem.model_validate(_ranked_row(row, rank))
            for rank, row in enumerate(rows[: body.top_k], start=1)
        ]
        return HybridSearchDocumentsResponse(
            query_id=body.query_id, retrieval_mode="hybrid", results=results
        )

    async def search_agent_memory(
        self, *, body: SearchAgentMemoryRequest, tenant_id: str
    ) -> SearchAgentMemoryResponse:
        """QP-6; errors: ValidationError, ChunkProfileNotFound, EmbeddingGenerationFailed.

        No embedding generator exists. Absent caller groups bind to an empty list.
        created_at is taken verbatim from the projected document timestamp.
        """
        if body.query_embedding is None:
            raise ValidationError(
                "query_embedding is required because server-side embedding is unavailable.",
                details={"field": "query_embedding"},
            )
        await self._require_profile(tenant_id=tenant_id, chunk_profile_id=body.chunk_profile_id)
        rows = await self.repos.chunks.run_qp_6(
            query_embedding=body.query_embedding,
            num_candidates=body.num_candidates,
            top_k=body.top_k,
            tenant_id=tenant_id,
            chunk_profile_id=body.chunk_profile_id,
            memory_type=body.memory_type,
            user_id=body.user_id,
            group_ids=body.group_ids if body.group_ids is not None else [],
        )
        results: list[SearchAgentMemoryResponseResultsItem] = [
            SearchAgentMemoryResponseResultsItem.model_validate(_ranked_row(row, rank))
            for rank, row in enumerate(rows[: body.top_k], start=1)
        ]
        return SearchAgentMemoryResponse(
            query_id=body.query_id, retrieval_mode="vector", results=results
        )
