"""Focused service tests using repositories only, with no database or HTTP app."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.api.schemas import CreateDocumentRequest, UpdateDocumentRequest
from app.db.base import MAX_FIND_RESULTS
from app.db.repositories import Repositories
from app.errors import DocumentNotFound, InvalidRequest, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument, TenantsDocument
from app.services.documents import DocumentsService

TENANT = "abcdef012345abcdef012345"
DOCUMENT = "012345abcdef012345abcdef"
NOW = datetime(2025, 1, 1, tzinfo=UTC)


def _document(**changes: Any) -> DocumentsDocument:
    data: dict[str, Any] = {
        "_id": DOCUMENT,
        "tenant_id": TENANT,
        "document_type": "text",
        "source_system": "upload",
        "ingest_status": "uploaded",
        "is_agent_memory": False,
        "created_at": NOW,
        "updated_at": NOW,
        "access": {"user_ids": [TENANT], "group_ids": []},
        "ingest_errors": [],
    }
    data.update(changes)
    return DocumentsDocument.model_validate(data)


def _body(**changes: Any) -> CreateDocumentRequest:
    data: dict[str, Any] = {
        "document_type": "text",
        "source_system": "upload",
        "ingest_status": "uploaded",
        "is_agent_memory": False,
        "access": {"user_ids": [], "group_ids": []},
        "ingest_errors": [],
    }
    data.update(changes)
    return CreateDocumentRequest.model_validate(data)


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
                "_id": TENANT,
                "tenant_key": "demo",
                "name": "Demo",
                "status": "active",
                "created_at": NOW,
                "updated_at": NOW,
            }
        )


class FakeDocuments:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.documents: list[DocumentsDocument] = []
        self.reads: list[DocumentsDocument | None] = [_document()]
        self.inserted: list[DocumentsDocument] = []
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.matched = True

    async def insert_one(self, document: DocumentsDocument) -> None:
        self.inserted.append(document)

    async def run_qp_1(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            ("qp1", dict(tenant_id=tenant_id, page_size=page_size, start_date=start_date))
        )
        return self.rows

    async def run_qp_2(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            ("qp2", dict(tenant_id=tenant_id, page_size=page_size, start_date=start_date))
        )
        return self.rows

    async def find_many(
        self, *, tenant_id: str | None = None, limit: int = MAX_FIND_RESULTS
    ) -> list[DocumentsDocument]:
        self.calls.append(("find", dict(tenant_id=tenant_id, limit=limit)))
        return self.documents

    async def find_one_by_id_and_tenant_id(
        self, *, id: str, tenant_id: str
    ) -> DocumentsDocument | None:
        self.calls.append(("read", dict(id=id, tenant_id=tenant_id)))
        return self.reads.pop(0)

    async def update_one_by_id_and_tenant_id(
        self, *, id: str, tenant_id: str, changes: dict[str, Any]
    ) -> bool:
        self.calls.append(("update", dict(id=id, tenant_id=tenant_id, changes=changes)))
        return self.matched


def _service(documents: FakeDocuments, *, exists: bool = True) -> DocumentsService:
    return DocumentsService(
        cast(
            Repositories,
            SimpleNamespace(
                documents=documents,
                tenants=FakeTenants(exists),
            ),
        )
    )


async def test_create_metadata_and_echo() -> None:
    repo = FakeDocuments()
    body = _body(
        raw_text="Already extracted", ingest_status="embedded", structured_attributes={"x": 1}
    )
    before = datetime.now(UTC)
    response = await _service(repo).create_document(body=body, tenant_id=TENANT)
    assert len(repo.inserted) == 1
    saved = repo.inserted[0]
    assert saved.id is not None and len(saved.id) == 24
    assert saved.created_at == saved.updated_at >= before
    assert response.document.id == saved.id
    assert response.document.raw_text == body.raw_text
    assert response.document.ingest_status == "embedded"
    assert response.document.structured_attributes == {"x": 1}
    assert response.document.title is None
    assert response.document.access.user_ids == []
    assert repo.calls == []


@pytest.mark.parametrize("operation", ["create", "ready", "all", "statuses"])
async def test_tenant_required_before_backing(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo, exists=False)
    with pytest.raises(TenantNotFound):
        if operation == "create":
            await service.create_document(body=_body(), tenant_id=TENANT)
        elif operation == "statuses":
            await service.list_document_ingest_statuses(tenant_id=TENANT)
        else:
            await service.list_retrieval_ready_documents(
                tenant_id=TENANT, ready_only=operation == "ready"
            )
    assert repo.calls == [] and repo.inserted == []


@pytest.mark.parametrize(
    "filters",
    [
        {"document_types": "text,invalid"},
        {"source_systems": "invalid"},
        {"document_types": ""},
        {"source_systems": "upload,"},
    ],
)
async def test_invalid_filter_before_lookup(filters: dict[str, str]) -> None:
    repo = FakeDocuments()
    with pytest.raises(ValidationError):
        await _service(repo, exists=False).list_retrieval_ready_documents(
            tenant_id=TENANT,
            document_types=filters.get("document_types"),
            source_systems=filters.get("source_systems"),
        )
    assert repo.calls == []


async def test_ready_pattern_page_filtering_and_nullable_mapping() -> None:
    repo = FakeDocuments()
    row = _document().model_dump(by_alias=True)
    row.pop("title")
    row.pop("source_uri")
    repo.rows = [dict(row, document_type="pdf"), row, row]
    response = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT,
        document_types="text, csv",
        source_systems="upload",
        created_after=NOW,
        limit=2,
    )
    assert len(response.documents) == 1
    assert response.documents[0].id == DOCUMENT
    assert response.documents[0].title is None
    assert response.documents[0].source_uri is None
    assert repo.calls == [("qp1", dict(tenant_id=TENANT, page_size=2, start_date=NOW))]


async def test_false_branch_filters_bounded_page_in_memory() -> None:
    repo = FakeDocuments()
    repo.documents = [
        _document(created_at=NOW - timedelta(days=1)),
        _document(source_system="s3"),
        _document(title="Included"),
        _document(),
    ]
    response = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT,
        ready_only=False,
        document_types="text",
        source_systems="upload",
        created_after=NOW,
        limit=3,
    )
    assert [item.title for item in response.documents] == ["Included"]
    assert repo.calls == [("find", dict(tenant_id=TENANT, limit=3))]


@pytest.mark.parametrize("operation", ["ready", "all", "statuses"])
async def test_empty_results_and_default_page(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo)
    if operation == "statuses":
        response = await service.list_document_ingest_statuses(tenant_id=TENANT)
    else:
        response = await service.list_retrieval_ready_documents(
            tenant_id=TENANT, ready_only=operation == "ready"
        )
    assert response.documents == []
    name = {"ready": "qp1", "all": "find", "statuses": "qp2"}[operation]
    params = (
        dict(tenant_id=TENANT, limit=MAX_FIND_RESULTS)
        if operation == "all"
        else dict(
            tenant_id=TENANT,
            page_size=MAX_FIND_RESULTS,
            start_date=None,
        )
    )
    assert repo.calls == [(name, params)]


async def test_ingest_status_pattern_mapping() -> None:
    repo = FakeDocuments()
    row = _document(ingest_status="failed", ingest_errors=[{"reason": "bad text"}]).model_dump(
        by_alias=True
    )
    row.pop("file_name")
    repo.rows = [row, row]
    response = await _service(repo).list_document_ingest_statuses(
        tenant_id=TENANT, created_after=NOW, limit=1
    )
    item = response.documents[0]
    assert len(response.documents) == 1
    assert item.id == DOCUMENT and item.file_name is None
    assert item.ingest_errors == [{"reason": "bad text"}] and item.ingest_status == "failed"
    assert item.updated_at == NOW
    assert repo.calls == [("qp2", dict(tenant_id=TENANT, page_size=1, start_date=NOW))]


async def test_get_scoped_response() -> None:
    repo = FakeDocuments()
    response = await _service(repo, exists=False).get_document(
        tenant_id=TENANT, document_id=DOCUMENT
    )
    assert response.document.access.user_ids == [TENANT]
    assert response.document.tenant_id == TENANT
    assert response.document.raw_text is None
    assert repo.calls == [("read", dict(id=DOCUMENT, tenant_id=TENANT))]


@pytest.mark.parametrize("record", [None, _document(tenant_id="1" * 24)])
@pytest.mark.parametrize("operation", ["get", "update"])
async def test_missing_or_wrong_tenant(record: DocumentsDocument | None, operation: str) -> None:
    repo = FakeDocuments()
    repo.reads = [record]
    service = _service(repo)
    with pytest.raises(DocumentNotFound):
        if operation == "get":
            await service.get_document(tenant_id=TENANT, document_id=DOCUMENT)
        else:
            await service.update_document(
                body=UpdateDocumentRequest(title="new"), tenant_id=TENANT, document_id=DOCUMENT
            )
    assert len(repo.calls) == 1


@pytest.mark.parametrize("empty", [False, True])
async def test_patch_explicit_fields_readback_and_empty_patch(empty: bool) -> None:
    repo = FakeDocuments()
    updated = _document(title="New", updated_at=NOW + timedelta(days=1))
    repo.reads = [_document(), updated]
    body = (
        UpdateDocumentRequest() if empty else UpdateDocumentRequest(title="New", ingest_errors=[])
    )
    response = await _service(repo).update_document(
        body=body, tenant_id=TENANT, document_id=DOCUMENT
    )
    assert response.document.title == "New"
    assert response.document.updated_at == updated.updated_at
    name, parameters = repo.calls[1]
    assert name == "update" and parameters["tenant_id"] == TENANT
    changes: dict[str, Any] = parameters["changes"]
    assert set(changes) == ({"updated_at"} if empty else {"title", "ingest_errors", "updated_at"})
    assert changes["updated_at"].tzinfo is UTC
    assert [call[0] for call in repo.calls] == ["read", "update", "read"]


@pytest.mark.parametrize("failure", ["no_match", "missing_readback", "wrong_readback"])
async def test_patch_failure_paths(failure: str) -> None:
    repo = FakeDocuments()
    repo.matched = failure != "no_match"
    repo.reads = [
        _document(),
        None if failure == "missing_readback" else _document(tenant_id="1" * 24),
    ]
    with pytest.raises(DocumentNotFound):
        await _service(repo).update_document(
            body=UpdateDocumentRequest(), tenant_id=TENANT, document_id=DOCUMENT
        )
    assert len(repo.calls) == (2 if failure == "no_match" else 3)


@pytest.mark.parametrize("field", ["access", "ingest_errors"])
async def test_create_generator_container_gap_does_not_write(field: str) -> None:
    repo = FakeDocuments()
    with pytest.raises(InvalidRequest):
        await _service(repo).create_document(body=_body(**{field: None}), tenant_id=TENANT)
    assert repo.inserted == []


@pytest.mark.parametrize("field", ["access", "ingest_errors", "_id"])
async def test_get_missing_required_response_fields(field: str) -> None:
    repo = FakeDocuments()
    repo.reads = [_document(**{field: None})]
    with pytest.raises(InvalidRequest):
        await _service(repo).get_document(tenant_id=TENANT, document_id=DOCUMENT)


async def test_status_missing_errors_generator_gap() -> None:
    repo = FakeDocuments()
    repo.rows = [_document(ingest_errors=None).model_dump(by_alias=True)]
    with pytest.raises(InvalidRequest):
        await _service(repo).list_document_ingest_statuses(tenant_id=TENANT)
