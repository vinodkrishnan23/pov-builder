"""Business logic for document metadata; no content processing is performed."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.api.schemas import (
    CreateDocumentRequest,
    CreateDocumentResponse,
    GetDocumentResponse,
    ListDocumentIngestStatusesResponse,
    ListDocumentIngestStatusesResponseDocumentsItem,
    ListRetrievalReadyDocumentsResponse,
    ListRetrievalReadyDocumentsResponseDocumentsItem,
    UpdateDocumentRequest,
    UpdateDocumentResponse,
)
from app.db.base import MAX_FIND_RESULTS
from app.db.repositories import Repositories
from app.errors import DocumentNotFound, InvalidRequest, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument


def _parse_filter(value: str | None, allowed: set[str], field: str) -> set[str] | None:
    if value is None:
        return None
    entries = {entry.strip() for entry in value.split(",")}
    if not entries <= allowed:
        raise ValidationError("Invalid comma-separated filter entries.", details={"field": field})
    return entries


def _record_data(document: DocumentsDocument) -> dict[str, Any]:
    # These required response containers have no generated omission/default semantics.
    # Do not invent values for absent optional stored metadata.
    missing: list[str] = []
    if document.id is None:
        missing.append("_id")
    if document.access is None:
        missing.append("access")
    else:
        if document.access.user_ids is None:
            missing.append("access.user_ids")
        if document.access.group_ids is None:
            missing.append("access.group_ids")
    if document.ingest_errors is None:
        missing.append("ingest_errors")
    if missing:
        raise InvalidRequest(
            "Generated response requires optional stored fields without defaults.",
            details={"fields": missing},
        )
    return document.model_dump(by_alias=True)


class DocumentsService:
    """Tenant-scoped document persistence and authoritative query-pattern reads."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_document(
        self, *, body: CreateDocumentRequest, tenant_id: str
    ) -> CreateDocumentResponse:
        """createDocument: insert metadata; errors ValidationError, TenantNotFound."""
        await self._require_tenant(tenant_id)
        now = datetime.now(UTC)
        data: dict[str, Any] = body.model_dump()
        # The generated ID default is None and insert_one does not return its ID.
        data.update(id=uuid4().hex[:24], tenant_id=tenant_id, created_at=now, updated_at=now)
        document = DocumentsDocument.model_validate(data)
        response = CreateDocumentResponse.model_validate({"document": _record_data(document)})
        await self.repos.documents.insert_one(document)
        return response

    async def list_retrieval_ready_documents(
        self,
        *,
        tenant_id: str,
        ready_only: bool = True,
        document_types: str | None = None,
        source_systems: str | None = None,
        created_after: datetime | None = None,
        limit: int | None = None,
    ) -> ListRetrievalReadyDocumentsResponse:
        """QP-1 when ready_only, otherwise tenant CRUD; errors ValidationError, TenantNotFound."""
        types = _parse_filter(
            document_types,
            {
                "pdf",
                "csv",
                "google_sheet",
                "text",
                "slack_thread",
                "confluence_page",
                "jira_ticket",
                "agent_memory",
                "other",
            },
            "document_types",
        )
        systems = _parse_filter(
            source_systems,
            {
                "upload",
                "s3",
                "slack",
                "confluence",
                "jira",
                "google_sheets",
                "csv",
                "pdf",
                "agent_conversation",
                "other",
            },
            "source_systems",
        )
        await self._require_tenant(tenant_id)
        page_size = MAX_FIND_RESULTS if limit is None else limit
        items: list[ListRetrievalReadyDocumentsResponseDocumentsItem]
        if ready_only:
            rows = await self.repos.documents.run_qp_1(
                tenant_id=tenant_id, start_date=created_after, page_size=page_size
            )
            items = []
            for row in self._page(rows, page_size):
                if types is not None and row["document_type"] not in types:
                    continue
                if systems is not None and row["source_system"] not in systems:
                    continue
                data: dict[str, Any] = dict(row)
                data["_id"] = str(row["_id"])
                items.append(ListRetrievalReadyDocumentsResponseDocumentsItem.model_validate(data))
        else:
            documents = await self.repos.documents.find_many(tenant_id=tenant_id, limit=page_size)
            # MongoDB uses negative limits as bounded single batches and zero as unbounded.
            documents = documents[: abs(page_size)] if page_size else documents
            items = [
                ListRetrievalReadyDocumentsResponseDocumentsItem.model_validate(doc.model_dump())
                for doc in documents
                if (types is None or doc.document_type in types)
                and (systems is None or doc.source_system in systems)
                and (created_after is None or doc.created_at >= created_after)
            ]
        return ListRetrievalReadyDocumentsResponse(documents=items)

    async def list_document_ingest_statuses(
        self, *, tenant_id: str, created_after: datetime | None = None, limit: int | None = None
    ) -> ListDocumentIngestStatusesResponse:
        """QP-2 with created_at cutoff; errors ValidationError, TenantNotFound."""
        await self._require_tenant(tenant_id)
        page_size = MAX_FIND_RESULTS if limit is None else limit
        rows = await self.repos.documents.run_qp_2(
            tenant_id=tenant_id, start_date=created_after, page_size=page_size
        )
        items: list[ListDocumentIngestStatusesResponseDocumentsItem] = []
        for row in self._page(rows, page_size):
            if row.get("ingest_errors") is None:
                raise InvalidRequest(
                    "Generated response requires ingest_errors without a default.",
                    details={"fields": ["ingest_errors"]},
                )
            data: dict[str, Any] = dict(row)
            data["_id"] = str(row["_id"])
            items.append(ListDocumentIngestStatusesResponseDocumentsItem.model_validate(data))
        return ListDocumentIngestStatusesResponse(documents=items)

    async def get_document(self, *, tenant_id: str, document_id: str) -> GetDocumentResponse:
        """Scoped CRUD read; errors InvalidId (edge validation), DocumentNotFound."""
        document = await self._require_document(tenant_id, document_id)
        return GetDocumentResponse.model_validate({"document": _record_data(document)})

    async def update_document(
        self, *, body: UpdateDocumentRequest, tenant_id: str, document_id: str
    ) -> UpdateDocumentResponse:
        """Scoped PATCH and readback; errors ValidationError, DocumentNotFound."""
        await self._require_document(tenant_id, document_id)
        changes: dict[str, Any] = body.model_dump(exclude_unset=True)
        changes["updated_at"] = datetime.now(UTC)
        matched = await self.repos.documents.update_one_by_id_and_tenant_id(
            id=document_id, tenant_id=tenant_id, changes=changes
        )
        if not matched:
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        document = await self._require_document(tenant_id, document_id)
        return UpdateDocumentResponse.model_validate({"document": _record_data(document)})

    async def _require_tenant(self, tenant_id: str) -> None:
        tenant = await self.repos.tenants.find_one_by_id(tenant_id)
        if tenant is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})

    async def _require_document(self, tenant_id: str, document_id: str) -> DocumentsDocument:
        document = await self.repos.documents.find_one_by_id_and_tenant_id(
            id=document_id, tenant_id=tenant_id
        )
        if document is None or document.tenant_id.lower() != tenant_id.lower():
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        return document

    @staticmethod
    def _page(rows: list[dict[str, Any]], page_size: int) -> list[dict[str, Any]]:
        return rows[: abs(page_size)] if page_size else rows
