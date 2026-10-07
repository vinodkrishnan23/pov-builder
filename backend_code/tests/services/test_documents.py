"""Focused document service tests; no driver or HTTP app involved."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.api.schemas import CreateDocumentRequest, UpdateDocumentRequest
from app.db.base import MAX_FIND_RESULTS
from app.db.repositories import Repositories
from app.errors import DocumentNotFound, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument, TenantsDocument
from app.services.documents import DocumentsService

TENANT_ID = "a" * 24
DOCUMENT_ID = "b" * 24
NOW = datetime(2025, 1, 1, tzinfo=UTC)


def _document(**overrides: Any) -> DocumentsDocument:
    data: dict[str, Any] = {
        "id": DOCUMENT_ID,
        "tenant_id": TENANT_ID,
        "document_type": "text",
        "source_system": "upload",
        "ingest_status": "uploaded",
        "is_agent_memory": False,
        "created_at": NOW,
        "updated_at": NOW,
        "raw_text": "Stored text only",
    }
    data.update(overrides)
    return DocumentsDocument.model_validate(data)


def _body() -> CreateDocumentRequest:
    return CreateDocumentRequest(
        document_type="text",
        source_system="upload",
        ingest_status="uploaded",
        is_agent_memory=False,
    )


class FakeTenants:
    def __init__(self, exists: bool = True) -> None:
        self.exists = exists
        self.calls: list[str] = []

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append(value)
        if not self.exists:
            return None
        return TenantsDocument.model_validate(
            {
                "_id": value,
                "tenant_key": "demo",
                "name": "Demo",
                "status": "inactive",
                "created_at": NOW,
                "updated_at": NOW,
            }
        )


class FakeDocuments:
    def __init__(self) -> None:
        self.document: DocumentsDocument | None = _document()
        self.documents: list[DocumentsDocument] = []
        self.rows: list[dict[str, Any]] = []
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.inserted: DocumentsDocument | None = None
        self.matched = True
        self.post_read: DocumentsDocument | None = None
        self.replace_after_update = False

    async def insert_one(self, document: DocumentsDocument) -> None:
        self.calls.append(("insert", {}))
        self.inserted = document

    async def find_one_by_id(self, value: str) -> DocumentsDocument | None:
        self.calls.append(("read", {"id": value}))
        return self.document

    async def find_many(
        self, *, tenant_id: str | None = None, limit: int = MAX_FIND_RESULTS
    ) -> list[DocumentsDocument]:
        self.calls.append(("find", {"tenant_id": tenant_id, "limit": limit}))
        return self.documents[:limit]

    async def run_qp_1(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            (
                "qp1",
                {
                    "tenant_id": tenant_id,
                    "page_size": page_size,
                    "start_date": start_date,
                },
            )
        )
        return self.rows

    async def run_qp_2(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            (
                "qp2",
                {
                    "tenant_id": tenant_id,
                    "page_size": page_size,
                    "start_date": start_date,
                },
            )
        )
        return self.rows

    async def update_one_by_id_and_tenant_id(
        self, *, id: str, tenant_id: str, changes: dict[str, Any]
    ) -> bool:
        self.calls.append(("update", {"id": id, "tenant_id": tenant_id, "changes": changes}))
        if self.replace_after_update:
            self.document = self.post_read
        elif self.document is not None and self.matched:
            self.document = DocumentsDocument.model_validate(
                {**self.document.model_dump(), **changes}
            )
        return self.matched


def _service(documents: FakeDocuments, tenants: FakeTenants | None = None) -> DocumentsService:
    return DocumentsService(
        cast(
            Repositories,
            SimpleNamespace(
                documents=documents,
                tenants=tenants if tenants is not None else FakeTenants(),
            ),
        )
    )


def _row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = _document().model_dump(by_alias=True, exclude_none=True)
    row.update(overrides)
    return row


async def test_create_minimal_metadata_with_inactive_tenant() -> None:
    repo = FakeDocuments()
    tenants = FakeTenants()
    result = await _service(repo, tenants).create_document(body=_body(), tenant_id=TENANT_ID)
    stored = repo.inserted
    assert stored is not None
    assert stored.id is not None and len(stored.id) == 24
    assert stored.tenant_id == TENANT_ID
    assert stored.created_at == stored.updated_at
    assert stored.created_at.tzinfo == UTC
    assert stored.access is None and stored.ingest_errors is None
    assert result.document.id == stored.id
    assert result.document.title is None
    assert result.document.access.user_ids == []
    assert result.document.ingest_errors == []
    assert tenants.calls == [TENANT_ID]
    assert repo.calls == [("insert", {})]


async def test_create_preserves_supplied_metadata_and_associations() -> None:
    repo = FakeDocuments()
    body = CreateDocumentRequest.model_validate(
        {
            **_body().model_dump(exclude_none=True),
            "raw_text": "provided",
            "source_uri": "s3://external/object",
            "structured_attributes": {"label": "demo"},
            "access": {"user_ids": [DOCUMENT_ID]},
            "ingest_errors": [{"reason": "provided"}],
        }
    )
    result = await _service(repo).create_document(body=body, tenant_id=TENANT_ID)
    assert result.document.raw_text == "provided"
    assert result.document.source_uri == body.source_uri
    assert result.document.structured_attributes == {"label": "demo"}
    assert result.document.access.user_ids == [DOCUMENT_ID]
    assert result.document.access.group_ids == []
    assert result.document.ingest_errors == [{"reason": "provided"}]


@pytest.mark.parametrize("operation", ["create", "ready", "crud", "statuses"])
async def test_tenant_missing_prevents_backing(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo, FakeTenants(False))
    with pytest.raises(TenantNotFound):
        if operation == "create":
            await service.create_document(body=_body(), tenant_id=TENANT_ID)
        elif operation == "statuses":
            await service.list_document_ingest_statuses(tenant_id=TENANT_ID)
        else:
            await service.list_retrieval_ready_documents(
                tenant_id=TENANT_ID, ready_only=operation == "ready"
            )
    assert repo.calls == []


@pytest.mark.parametrize("ready_only", [True, False])
@pytest.mark.parametrize(
    "field,value",
    [
        ("document_types", "pdf,invalid"),
        ("source_systems", "upload,invalid"),
        ("document_types", ""),
        ("source_systems", "upload,"),
    ],
)
async def test_invalid_csv_filters(field: str, value: str, ready_only: bool) -> None:
    repo = FakeDocuments()
    tenants = FakeTenants()
    with pytest.raises(ValidationError):
        await _service(repo, tenants).list_retrieval_ready_documents(
            tenant_id=TENANT_ID,
            ready_only=ready_only,
            document_types=value if field == "document_types" else None,
            source_systems=value if field == "source_systems" else None,
        )
    assert repo.calls == [] and tenants.calls == []


async def test_ready_pattern_bindings_filters_summary_and_page_limit() -> None:
    repo = FakeDocuments()
    repo.rows = [_row(document_type="pdf"), _row(), _row()]
    result = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT_ID,
        document_types=" text ,csv",
        source_systems="upload",
        created_after=NOW,
        limit=2,
    )
    assert repo.calls == [("qp1", {"tenant_id": TENANT_ID, "start_date": NOW, "page_size": 2})]
    assert len(result.documents) == 1  # Filter the already limited page, do not refill.
    item = result.documents[0]
    assert item.id == DOCUMENT_ID and item.title is None and item.source_uri is None
    assert "raw_text" not in item.model_dump()
    assert "access" not in item.model_dump()


async def test_crud_branch_date_membership_and_nonembedded_documents() -> None:
    repo = FakeDocuments()
    repo.documents = [
        _document(created_at=NOW - timedelta(seconds=1)),
        _document(document_type="pdf"),
        _document(source_system="s3"),
        _document(),
    ]
    result = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT_ID,
        ready_only=False,
        created_after=NOW,
        document_types="text",
        source_systems="upload",
        limit=4,
    )
    assert repo.calls == [("find", {"tenant_id": TENANT_ID, "limit": 4})]
    assert len(result.documents) == 1
    assert result.documents[0].created_at == NOW
    assert result.documents[0].id == DOCUMENT_ID
    assert "ingest_status" not in result.documents[0].model_dump()


@pytest.mark.parametrize("operation", ["ready", "crud", "statuses"])
async def test_empty_lists_and_absent_limit_use_repository_cap(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo)
    if operation == "statuses":
        result = await service.list_document_ingest_statuses(tenant_id=TENANT_ID)
    else:
        result = await service.list_retrieval_ready_documents(
            tenant_id=TENANT_ID, ready_only=operation == "ready"
        )
    assert result.documents == []
    args = repo.calls[0][1]
    assert args.get("page_size", args.get("limit")) == MAX_FIND_RESULTS
    if operation != "crud":
        assert args["start_date"] is None


async def test_statuses_preserve_errors_and_all_states_with_limit() -> None:
    repo = FakeDocuments()
    repo.rows = [
        _row(ingest_status="failed", ingest_errors=[{"message": "stored"}]),
        _row(),
        _row(),
    ]
    result = await _service(repo).list_document_ingest_statuses(
        tenant_id=TENANT_ID, created_after=NOW, limit=2
    )
    assert repo.calls == [("qp2", {"tenant_id": TENANT_ID, "start_date": NOW, "page_size": 2})]
    assert len(result.documents) == 2
    assert result.documents[0].ingest_errors == [{"message": "stored"}]
    assert result.documents[1].ingest_status == "uploaded"
    assert result.documents[1].ingest_errors == []
    assert result.documents[1].title is None
    assert result.documents[1].updated_at == NOW
    assert "raw_text" not in result.documents[0].model_dump()


async def test_get_full_record_without_requiring_tenant() -> None:
    repo = FakeDocuments()
    tenants = FakeTenants(False)
    result = await _service(repo, tenants).get_document(
        tenant_id=TENANT_ID, document_id=DOCUMENT_ID
    )
    assert result.document.id == DOCUMENT_ID
    assert result.document.raw_text == "Stored text only"
    assert result.document.title is None
    assert result.document.access.group_ids == []
    assert tenants.calls == []
    assert repo.calls == [("read", {"id": DOCUMENT_ID})]


@pytest.mark.parametrize("operation", ["get", "update"])
@pytest.mark.parametrize("missing", [True, False])
async def test_document_not_found_or_not_owned(operation: str, missing: bool) -> None:
    repo = FakeDocuments()
    repo.document = None if missing else _document(tenant_id="c" * 24)
    service = _service(repo)
    with pytest.raises(DocumentNotFound):
        if operation == "get":
            await service.get_document(tenant_id=TENANT_ID, document_id=DOCUMENT_ID)
        else:
            await service.update_document(
                body=UpdateDocumentRequest(title="new"),
                tenant_id=TENANT_ID,
                document_id=DOCUMENT_ID,
            )
    assert [call[0] for call in repo.calls] == ["read"]


async def test_patch_only_supplied_fields_and_nested_replacement_readback() -> None:
    repo = FakeDocuments()
    repo.document = _document(access={"user_ids": [DOCUMENT_ID], "group_ids": [TENANT_ID]})
    body = UpdateDocumentRequest.model_validate(
        {
            "title": "new",
            "ingest_status": "embedded",
            "access": {"user_ids": [TENANT_ID]},
        }
    )
    result = await _service(repo).update_document(
        body=body, tenant_id=TENANT_ID, document_id=DOCUMENT_ID
    )
    assert [call[0] for call in repo.calls] == ["read", "update", "read"]
    args = repo.calls[1][1]
    assert args["id"] == DOCUMENT_ID and args["tenant_id"] == TENANT_ID
    changes: dict[str, Any] = args["changes"]
    assert set(changes) == {"title", "ingest_status", "access", "updated_at"}
    assert result.document.title == "new" and result.document.ingest_status == "embedded"
    assert result.document.raw_text == "Stored text only"
    assert result.document.created_at == NOW and result.document.updated_at > NOW
    assert result.document.access.user_ids == [TENANT_ID]
    assert result.document.access.group_ids == []
    assert result.document.document_type == "text" and result.document.source_system == "upload"
    assert result.document.is_agent_memory is False


@pytest.mark.parametrize("outcome", ["unmatched", "missing", "wrong_tenant"])
async def test_patch_write_or_post_read_not_found(outcome: str) -> None:
    repo = FakeDocuments()
    repo.matched = outcome != "unmatched"
    repo.replace_after_update = outcome != "unmatched"
    repo.post_read = _document(tenant_id="c" * 24) if outcome == "wrong_tenant" else None
    with pytest.raises(DocumentNotFound):
        await _service(repo).update_document(
            body=UpdateDocumentRequest(), tenant_id=TENANT_ID, document_id=DOCUMENT_ID
        )
    expected = ["read", "update"] if outcome == "unmatched" else ["read", "update", "read"]
    assert [call[0] for call in repo.calls] == expected


async def test_patch_null_ingest_status_rejected_before_write() -> None:
    repo = FakeDocuments()
    with pytest.raises(ValidationError):
        await _service(repo).update_document(
            body=UpdateDocumentRequest(ingest_status=None),
            tenant_id=TENANT_ID,
            document_id=DOCUMENT_ID,
        )
    assert [call[0] for call in repo.calls] == ["read"]
