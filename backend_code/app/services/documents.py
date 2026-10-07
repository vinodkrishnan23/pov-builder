"""Business logic for the documents resource."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, get_args
from uuid import uuid4

from pydantic import ValidationError as ModelValidationError

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
from app.errors import DocumentNotFound, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument


def _parse_filter(value: str | None, field: str) -> set[str] | None:
    if value is None:
        return None
    allowed = get_args(DocumentsDocument.model_fields[field].annotation)
    values = {item.strip() for item in value.split(",")}
    if not values.issubset(allowed):
        raise ValidationError(
            f"Invalid {field} filter elements.", details={"field": field, "values": sorted(values)}
        )
    return values


def _full_document(document: DocumentsDocument) -> dict[str, Any]:
    # Storage allows absent optional associations/errors, but generated full response
    # models require them. Empty response collections represent absence; they are
    # deliberately NOT persisted as invented stored defaults.
    data: dict[str, Any] = document.model_dump()
    data["access"] = {
        "user_ids": document.access.user_ids or [] if document.access is not None else [],
        "group_ids": document.access.group_ids or [] if document.access is not None else [],
    }
    data["ingest_errors"] = document.ingest_errors or []
    return data


class DocumentsService:
    """Tenant-scoped metadata CRUD and authoritative document query patterns."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_document(
        self, *, body: CreateDocumentRequest, tenant_id: str
    ) -> CreateDocumentResponse:
        """Create metadata only. Errors: ValidationError, TenantNotFound."""
        await self._require_tenant(tenant_id)
        now = datetime.now(UTC)
        data: dict[str, Any] = body.model_dump(exclude_unset=True)
        data.update(id=uuid4().hex[:24], tenant_id=tenant_id, created_at=now, updated_at=now)
        document = DocumentsDocument.model_validate(data)
        await self.repos.documents.insert_one(document)
        return CreateDocumentResponse.model_validate({"document": _full_document(document)})

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
        """QP-1 when ready, tenant CRUD otherwise. Errors: ValidationError, TenantNotFound."""
        types = _parse_filter(document_types, "document_type")
        sources = _parse_filter(source_systems, "source_system")
        await self._require_tenant(tenant_id)
        page_size = MAX_FIND_RESULTS if limit is None else limit
        items: list[ListRetrievalReadyDocumentsResponseDocumentsItem] = []
        if ready_only:
            rows = await self.repos.documents.run_qp_1(
                tenant_id=tenant_id, start_date=created_after, page_size=page_size
            )
            for row in rows[:page_size]:
                data: dict[str, Any] = dict(row)
                data["_id"] = str(row["_id"])
                item = ListRetrievalReadyDocumentsResponseDocumentsItem.model_validate(data)
                if types is not None and item.document_type not in types:
                    continue
                if sources is not None and item.source_system not in sources:
                    continue
                items.append(item)
        else:
            documents = await self.repos.documents.find_many(tenant_id=tenant_id, limit=page_size)
            for document in documents[:page_size]:
                if types is not None and document.document_type not in types:
                    continue
                if sources is not None and document.source_system not in sources:
                    continue
                if created_after is not None and document.created_at < created_after:
                    continue
                items.append(
                    ListRetrievalReadyDocumentsResponseDocumentsItem.model_validate(
                        document.model_dump()
                    )
                )
        return ListRetrievalReadyDocumentsResponse(documents=items)

    async def list_document_ingest_statuses(
        self, *, tenant_id: str, created_after: datetime | None = None, limit: int | None = None
    ) -> ListDocumentIngestStatusesResponse:
        """QP-2 across ingest states. Errors: ValidationError, TenantNotFound."""
        await self._require_tenant(tenant_id)
        page_size = MAX_FIND_RESULTS if limit is None else limit
        rows = await self.repos.documents.run_qp_2(
            tenant_id=tenant_id, start_date=created_after, page_size=page_size
        )
        items: list[ListDocumentIngestStatusesResponseDocumentsItem] = []
        for row in rows[:page_size]:
            data: dict[str, Any] = dict(row)
            data["_id"] = str(row["_id"])
            # The generated response requires an array even when storage omits it.
            if data.get("ingest_errors") is None:
                data["ingest_errors"] = []
            items.append(ListDocumentIngestStatusesResponseDocumentsItem.model_validate(data))
        return ListDocumentIngestStatusesResponse(documents=items)

    async def get_document(self, *, tenant_id: str, document_id: str) -> GetDocumentResponse:
        """Read and check ownership, without tenant lookup. Errors: InvalidId, DocumentNotFound."""
        document = await self._require_document(tenant_id, document_id)
        return GetDocumentResponse.model_validate({"document": _full_document(document)})

    async def update_document(
        self, *, body: UpdateDocumentRequest, tenant_id: str, document_id: str
    ) -> UpdateDocumentResponse:
        """Scoped patch, then read back. Errors: ValidationError, DocumentNotFound."""
        document = await self._require_document(tenant_id, document_id)
        changes: dict[str, Any] = body.model_dump(exclude_unset=True)
        changes["updated_at"] = datetime.now(UTC)
        # Validate supplied values against storage before a write; do not deep merge.
        try:
            DocumentsDocument.model_validate({**document.model_dump(), **changes})
        except ModelValidationError as error:
            raise ValidationError(
                "Patch is incompatible with the stored document shape.",
                details={"fields": sorted(body.model_fields_set)},
            ) from error
        matched = await self.repos.documents.update_one_by_id_and_tenant_id(
            id=document_id, tenant_id=tenant_id, changes=changes
        )
        if not matched:
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        updated = await self._require_document(tenant_id, document_id)
        return UpdateDocumentResponse.model_validate({"document": _full_document(updated)})

    async def _require_tenant(self, tenant_id: str) -> None:
        tenant = await self.repos.tenants.find_one_by_id(tenant_id)
        if tenant is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})

    async def _require_document(self, tenant_id: str, document_id: str) -> DocumentsDocument:
        document = await self.repos.documents.find_one_by_id(document_id)
        if document is None or document.tenant_id != tenant_id:
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        return document
