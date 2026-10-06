"""Business logic for the documents resource."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from secrets import token_hex
from typing import Any

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
from app.errors import DocumentNotFound, InvalidId, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument
from app.types import OBJECT_ID_PATTERN

_DOCUMENT_TYPES = frozenset(
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
    }
)
_SOURCE_SYSTEMS = frozenset(
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
    }
)
_CREATE_FIELDS = {
    "document_type",
    "title",
    "source_system",
    "source_uri",
    "mime_type",
    "file_name",
    "raw_text",
    "structured_attributes",
    "access",
    "ingest_status",
    "ingest_errors",
    "is_agent_memory",
}
_PATCH_FIELDS = _CREATE_FIELDS - {"document_type", "source_system", "is_agent_memory"}


def _validate_id(value: str, field: str, error: type[ValidationError] | type[InvalidId]) -> None:
    if re.fullmatch(OBJECT_ID_PATTERN, value) is None:
        raise error("Invalid ObjectId string.", details={"field": field, "value": value})


def _parse_filter(value: str | None, allowed: frozenset[str], field: str) -> set[str] | None:
    if value is None:
        return None
    members = {part.strip() for part in value.split(",")}
    if not members <= allowed:
        raise ValidationError("Invalid filter entries.", details={"field": field})
    return members


def _document_data(document: DocumentsDocument) -> dict[str, Any]:
    data = document.model_dump()
    data["access"] = {
        "user_ids": document.access.user_ids or [] if document.access is not None else [],
        "group_ids": document.access.group_ids or [] if document.access is not None else [],
    }
    data["ingest_errors"] = document.ingest_errors or []
    return data


class DocumentsService:
    """Tenant-scoped document metadata CRUD and authoritative query wrappers."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_document(
        self, *, body: CreateDocumentRequest, tenant_id: str
    ) -> CreateDocumentResponse:
        """Insert metadata without performing any ingest processing."""
        _validate_id(tenant_id, "tenant_id", ValidationError)
        try:
            validated = CreateDocumentRequest.model_validate(body.model_dump())
        except ModelValidationError as error:
            raise ValidationError("Invalid document fields.", details={"field": "body"}) from error
        await self._require_tenant(tenant_id)
        now = datetime.now(UTC)
        data = validated.model_dump(include=_CREATE_FIELDS)
        data.update(id=token_hex(12), tenant_id=tenant_id, created_at=now, updated_at=now)
        document = DocumentsDocument.model_validate(data)
        await self.repos.documents.insert_one(document)
        return CreateDocumentResponse.model_validate({"document": _document_data(document)})

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
        """Select QP-1 or tenant CRUD, then apply the declared post-read filters."""
        _validate_id(tenant_id, "tenant_id", ValidationError)
        types = _parse_filter(document_types, _DOCUMENT_TYPES, "document_types")
        sources = _parse_filter(source_systems, _SOURCE_SYSTEMS, "source_systems")
        await self._require_tenant(tenant_id)
        effective_limit = MAX_FIND_RESULTS if limit is None else limit
        items: list[ListRetrievalReadyDocumentsResponseDocumentsItem] = []
        if ready_only:
            rows = await self.repos.documents.run_qp_1(
                tenant_id=tenant_id, start_date=created_after, page_size=effective_limit
            )
            for row in rows[:effective_limit]:
                data: dict[str, Any] = dict(row)
                data["_id"] = str(row["_id"])
                item = ListRetrievalReadyDocumentsResponseDocumentsItem.model_validate(data)
                if types is not None and item.document_type not in types:
                    continue
                if sources is not None and item.source_system not in sources:
                    continue
                items.append(item)
        else:
            documents = await self.repos.documents.find_many(
                tenant_id=tenant_id, limit=effective_limit
            )
            for document in documents[:effective_limit]:
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
        """Read QP-2 results without retries or writes."""
        _validate_id(tenant_id, "tenant_id", ValidationError)
        await self._require_tenant(tenant_id)
        effective_limit = MAX_FIND_RESULTS if limit is None else limit
        rows = await self.repos.documents.run_qp_2(
            tenant_id=tenant_id, start_date=created_after, page_size=effective_limit
        )
        items: list[ListDocumentIngestStatusesResponseDocumentsItem] = []
        for row in rows[:effective_limit]:
            data: dict[str, Any] = dict(row)
            data["_id"] = str(row["_id"])
            data["ingest_errors"] = row.get("ingest_errors") or []
            items.append(ListDocumentIngestStatusesResponseDocumentsItem.model_validate(data))
        return ListDocumentIngestStatusesResponse(documents=items)

    async def get_document(self, *, tenant_id: str, document_id: str) -> GetDocumentResponse:
        """Read a document, enforcing ownership without a separate tenant read."""
        _validate_id(tenant_id, "tenant_id", InvalidId)
        _validate_id(document_id, "document_id", InvalidId)
        document = await self._require_document(tenant_id, document_id)
        return GetDocumentResponse.model_validate({"document": _document_data(document)})

    async def update_document(
        self, *, body: UpdateDocumentRequest, tenant_id: str, document_id: str
    ) -> UpdateDocumentResponse:
        """Replace explicitly supplied mutable values using the scoped repository update."""
        _validate_id(tenant_id, "tenant_id", ValidationError)
        _validate_id(document_id, "document_id", ValidationError)
        if not body.model_fields_set <= _PATCH_FIELDS:
            raise ValidationError("Invalid patch field names.", details={"field": "body"})
        changes = body.model_dump(exclude_unset=True, include=_PATCH_FIELDS)
        try:
            UpdateDocumentRequest.model_validate(changes)
        except ModelValidationError as error:
            raise ValidationError("Invalid patch values.", details={"field": "body"}) from error
        if "ingest_status" in changes and changes["ingest_status"] is None:
            raise ValidationError(
                "Ingest status cannot be null.", details={"field": "ingest_status"}
            )
        await self._require_document(tenant_id, document_id)
        changes["updated_at"] = datetime.now(UTC)
        matched = await self.repos.documents.update_one_by_id_and_tenant_id(
            id=document_id, tenant_id=tenant_id, changes=changes
        )
        if not matched:
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        document = await self._require_document(tenant_id, document_id)
        return UpdateDocumentResponse.model_validate({"document": _document_data(document)})

    async def _require_tenant(self, tenant_id: str) -> None:
        if await self.repos.tenants.find_one_by_id(tenant_id) is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})

    async def _require_document(self, tenant_id: str, document_id: str) -> DocumentsDocument:
        document = await self.repos.documents.find_one_by_id(document_id)
        if document is None or document.tenant_id.lower() != tenant_id.lower():
            raise DocumentNotFound(details={"tenant_id": tenant_id, "document_id": document_id})
        return document
