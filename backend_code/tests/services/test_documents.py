"""Document service unit tests using isolated, hand-written repositories."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.api.schemas import CreateDocumentRequest, UpdateDocumentRequest
from app.db.base import MAX_FIND_RESULTS
from app.db.repositories import Repositories
from app.errors import DocumentNotFound, InvalidId, TenantNotFound, ValidationError
from app.models.documents import DocumentsDocument, TenantsDocument
from app.services.documents import DocumentsService

TENANT = "a" * 24
OTHER = "b" * 24
DOC = "c" * 24
NOW = datetime(2025, 1, 2, tzinfo=UTC)


class StringableId:
    def __str__(self) -> str:
        return DOC


class FakeTenants:
    def __init__(self, exists: bool = True) -> None:
        self.exists = exists
        self.calls: list[str] = []

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append(value)
        if not self.exists:
            return None
        return TenantsDocument(
            tenant_key="demo", name="Demo", status="active", created_at=NOW, updated_at=NOW
        )


class FakeDocuments:
    def __init__(self) -> None:
        self.reads: list[DocumentsDocument | None] = []
        self.rows: list[dict[str, Any]] = []
        self.documents: list[DocumentsDocument] = []
        self.inserted: list[DocumentsDocument] = []
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.matched = True

    async def find_one_by_id(self, value: str) -> DocumentsDocument | None:
        self.calls.append(("read", {"id": value}))
        return self.reads.pop(0) if self.reads else None

    async def insert_one(self, document: DocumentsDocument) -> None:
        self.inserted.append(document)
        self.calls.append(("insert", {}))

    async def find_many(
        self, *, tenant_id: str | None = None, limit: int = MAX_FIND_RESULTS
    ) -> list[DocumentsDocument]:
        self.calls.append(("find", {"tenant_id": tenant_id, "limit": limit}))
        return self.documents

    async def run_qp_1(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            ("qp1", {"tenant_id": tenant_id, "page_size": page_size, "start_date": start_date})
        )
        return self.rows

    async def run_qp_2(
        self, *, tenant_id: str, page_size: int, start_date: datetime | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append(
            ("qp2", {"tenant_id": tenant_id, "page_size": page_size, "start_date": start_date})
        )
        return self.rows

    async def update_one_by_id_and_tenant_id(
        self, *, id: str, tenant_id: str, changes: dict[str, Any]
    ) -> bool:
        self.calls.append(("update", {"id": id, "tenant_id": tenant_id, "changes": changes}))
        return self.matched


def _service(repo: FakeDocuments, tenants: FakeTenants | None = None) -> DocumentsService:
    return DocumentsService(
        cast(Repositories, SimpleNamespace(documents=repo, tenants=tenants or FakeTenants()))
    )


def _document(**changes: object) -> DocumentsDocument:
    data: dict[str, Any] = {
        "id": DOC, "tenant_id": TENANT, "document_type": "text", "source_system": "upload",
        "ingest_status": "uploaded", "is_agent_memory": False,
        "created_at": NOW, "updated_at": NOW,
    }
    data.update(changes)
    return DocumentsDocument.model_validate(data)


def _body(**changes: object) -> CreateDocumentRequest:
    data: dict[str, Any] = {
        "document_type": "text", "source_system": "upload",
        "ingest_status": "uploaded", "is_agent_memory": False,
    }
    data.update(changes)
    return CreateDocumentRequest.model_validate(data)


async def test_create_preserves_state_and_maps_metadata() -> None:
    repo = FakeDocuments()
    tenants = FakeTenants()
    response = await _service(repo, tenants).create_document(
        tenant_id=TENANT,
        body=_body(
            document_type="agent_memory", ingest_status="failed", is_agent_memory=False,
            raw_text="supplied", structured_attributes={"label": "demo"},
            access={"user_ids": [OTHER]}, ingest_errors=[{"message": "failure"}],
        ),
    )
    assert tenants.calls == [TENANT]
    assert len(repo.inserted) == 1
    stored = repo.inserted[0]
    assert stored.tenant_id == TENANT
    assert stored.id is not None and len(stored.id) == 24
    assert stored.created_at == stored.updated_at
    assert stored.created_at.utcoffset() == timedelta(0)
    assert stored.ingest_status == "failed" and not stored.is_agent_memory
    assert response.document.id == stored.id
    assert response.document.raw_text == "supplied"
    assert response.document.structured_attributes == {"label": "demo"}
    assert response.document.access.user_ids == [OTHER]
    assert response.document.access.group_ids == []
    assert response.document.ingest_errors == [{"message": "failure"}]
    assert [name for name, _ in repo.calls] == ["insert"]


async def test_create_optional_defaults() -> None:
    response = await _service(FakeDocuments()).create_document(tenant_id=TENANT, body=_body())
    assert response.document.access.user_ids == []
    assert response.document.access.group_ids == []
    assert response.document.ingest_errors == []
    assert response.document.title is None and response.document.raw_text is None


@pytest.mark.parametrize("operation", ["create", "ready", "all", "statuses"])
async def test_missing_tenant_prevents_backing(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo, FakeTenants(False))
    with pytest.raises(TenantNotFound):
        if operation == "create":
            await service.create_document(tenant_id=TENANT, body=_body())
        elif operation == "statuses":
            await service.list_document_ingest_statuses(tenant_id=TENANT)
        else:
            await service.list_retrieval_ready_documents(
                tenant_id=TENANT, ready_only=operation == "ready"
            )
    assert repo.calls == []


@pytest.mark.parametrize("field", ["document_types", "source_systems"])
@pytest.mark.parametrize("value", ["", "unknown", "text,unknown", "upload,"])
async def test_invalid_csv_filters(field: str, value: str) -> None:
    tenants = FakeTenants()
    repo = FakeDocuments()
    with pytest.raises(ValidationError):
        await _service(repo, tenants).list_retrieval_ready_documents(
            tenant_id=TENANT,
            document_types=value if field == "document_types" else None,
            source_systems=value if field == "source_systems" else None,
        )
    assert tenants.calls == [] and repo.calls == []


async def test_ready_pattern_mapping_bindings_and_post_limit_filters() -> None:
    repo = FakeDocuments()
    row: dict[str, Any] = _document().model_dump(by_alias=True)
    row["_id"] = StringableId()
    repo.rows = [dict(row, document_type="pdf"), row, row]
    response = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT, document_types=" text, csv ", source_systems="upload",
        created_after=NOW, limit=2,
    )
    assert repo.calls == [("qp1", {"tenant_id": TENANT, "page_size": 2, "start_date": NOW})]
    assert len(response.documents) == 1  # No refill after filtering.
    item = response.documents[0]
    assert item.id == DOC and item.created_at == NOW
    assert item.title is None and item.file_name is None
    assert item.source_uri is None and item.structured_attributes is None
    assert "raw_text" not in item.model_dump() and "access" not in item.model_dump()


async def test_false_branch_date_and_enum_filters_without_ingest_restriction() -> None:
    repo = FakeDocuments()
    repo.documents = [
        _document(created_at=NOW - timedelta(days=1)), _document(document_type="pdf"),
        _document(source_system="s3"), _document(ingest_status="failed"),
    ]
    response = await _service(repo).list_retrieval_ready_documents(
        tenant_id=TENANT, ready_only=False, document_types="text", source_systems="upload",
        created_after=NOW,
    )
    assert repo.calls == [("find", {"tenant_id": TENANT, "limit": MAX_FIND_RESULTS})]
    assert len(response.documents) == 1 and response.documents[0].id == DOC
    assert "ingest_status" not in response.documents[0].model_dump()


@pytest.mark.parametrize("operation", ["ready", "all", "statuses"])
async def test_empty_lists_and_default_bindings(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo)
    if operation == "statuses":
        statuses = await service.list_document_ingest_statuses(tenant_id=TENANT)
        assert statuses.documents == []
    else:
        summaries = await service.list_retrieval_ready_documents(
            tenant_id=TENANT, ready_only=operation == "ready"
        )
        assert summaries.documents == []
    if operation == "all":
        assert repo.calls == [("find", {"tenant_id": TENANT, "limit": MAX_FIND_RESULTS})]
    else:
        assert repo.calls == [
            ("qp2" if operation == "statuses" else "qp1",
             {"tenant_id": TENANT, "page_size": MAX_FIND_RESULTS, "start_date": None})
        ]


async def test_status_projection_mapping_and_limit() -> None:
    repo = FakeDocuments()
    row: dict[str, Any] = {
        "_id": StringableId(), "document_type": "text", "source_system": "upload",
        "ingest_status": "failed", "updated_at": NOW,
    }
    repo.rows = [row, dict(row, ingest_errors=[{"message": "failure"}]), row]
    response = await _service(repo).list_document_ingest_statuses(
        tenant_id=TENANT, created_after=NOW, limit=2
    )
    assert repo.calls == [("qp2", {"tenant_id": TENANT, "page_size": 2, "start_date": NOW})]
    assert len(response.documents) == 2
    assert response.documents[0].id == DOC
    assert response.documents[0].title is None and response.documents[0].file_name is None
    assert response.documents[0].ingest_errors == []
    assert response.documents[1].ingest_errors == [{"message": "failure"}]
    assert response.documents[0].updated_at == NOW


async def test_get_full_document_without_tenant_read_or_writes() -> None:
    repo = FakeDocuments()
    repo.reads = [_document(raw_text="text", structured_attributes={"key": 3})]
    tenants = FakeTenants(False)
    response = await _service(repo, tenants).get_document(tenant_id=TENANT, document_id=DOC)
    assert tenants.calls == [] and repo.calls == [("read", {"id": DOC})]
    assert response.document.id == DOC and response.document.tenant_id == TENANT
    assert response.document.raw_text == "text"
    assert response.document.structured_attributes == {"key": 3}
    assert response.document.access.user_ids == [] and response.document.ingest_errors == []


@pytest.mark.parametrize("wrong_owner", [False, True])
@pytest.mark.parametrize("operation", ["get", "update"])
async def test_missing_document_or_wrong_owner(wrong_owner: bool, operation: str) -> None:
    repo = FakeDocuments()
    repo.reads = [_document(tenant_id=OTHER) if wrong_owner else None]
    service = _service(repo)
    with pytest.raises(DocumentNotFound):
        if operation == "get":
            await service.get_document(tenant_id=TENANT, document_id=DOC)
        else:
            await service.update_document(
                tenant_id=TENANT, document_id=DOC, body=UpdateDocumentRequest(title="new")
            )
    assert repo.calls == [("read", {"id": DOC})]


async def test_update_explicit_fields_nested_replacement_and_reread() -> None:
    repo = FakeDocuments()
    repo.reads = [
        _document(title="old", access={"group_ids": [OTHER]}),
        _document(title="new", access={"user_ids": [TENANT]}, ingest_status="embedded"),
    ]
    response = await _service(repo).update_document(
        tenant_id=TENANT, document_id=DOC,
        body=UpdateDocumentRequest.model_validate(
            {"title": "new", "access": {"user_ids": [TENANT]}, "ingest_status": "embedded"}
        ),
    )
    assert [name for name, _ in repo.calls] == ["read", "update", "read"]
    update = repo.calls[1][1]
    assert update["id"] == DOC and update["tenant_id"] == TENANT
    changes: dict[str, Any] = update["changes"]
    assert set(changes) == {"title", "access", "ingest_status", "updated_at"}
    assert changes["access"] == {"user_ids": [TENANT]}
    assert isinstance(changes["updated_at"], datetime)
    assert changes["updated_at"].utcoffset() == timedelta(0)
    assert response.document.title == "new" and response.document.ingest_status == "embedded"
    assert response.document.access.user_ids == [TENANT]
    assert response.document.access.group_ids == [] and response.document.created_at == NOW


@pytest.mark.parametrize("failure", ["unmatched", "missing_reread", "wrong_owner_reread"])
async def test_update_failure_and_reread_ownership(failure: str) -> None:
    repo = FakeDocuments()
    repo.matched = failure != "unmatched"
    repo.reads = [
        _document(), _document(tenant_id=OTHER) if failure == "wrong_owner_reread" else None,
    ]
    with pytest.raises(DocumentNotFound):
        await _service(repo).update_document(
            tenant_id=TENANT, document_id=DOC, body=UpdateDocumentRequest()
        )
    expected = ["read", "update"] if failure == "unmatched" else ["read", "update", "read"]
    assert [name for name, _ in repo.calls] == expected


@pytest.mark.parametrize("operation", ["create", "ready", "statuses", "get", "update"])
async def test_invalid_tenant_ids(operation: str) -> None:
    repo = FakeDocuments()
    tenants = FakeTenants()
    service = _service(repo, tenants)
    with pytest.raises(InvalidId if operation == "get" else ValidationError):
        if operation == "create":
            await service.create_document(tenant_id="bad", body=_body())
        elif operation == "ready":
            await service.list_retrieval_ready_documents(tenant_id="bad")
        elif operation == "statuses":
            await service.list_document_ingest_statuses(tenant_id="bad")
        elif operation == "get":
            await service.get_document(tenant_id="bad", document_id=DOC)
        else:
            await service.update_document(
                tenant_id="bad", document_id=DOC, body=UpdateDocumentRequest()
            )
    assert repo.calls == [] and tenants.calls == []


@pytest.mark.parametrize("operation", ["get", "update"])
async def test_invalid_document_ids(operation: str) -> None:
    repo = FakeDocuments()
    service = _service(repo)
    with pytest.raises(InvalidId if operation == "get" else ValidationError):
        if operation == "get":
            await service.get_document(tenant_id=TENANT, document_id="bad")
        else:
            await service.update_document(
                tenant_id=TENANT, document_id="bad", body=UpdateDocumentRequest()
            )
    assert repo.calls == []


@pytest.mark.parametrize("invalid", ["enum", "missing", "access"])
async def test_create_revalidates_unchecked_body(invalid: str) -> None:
    repo = FakeDocuments()
    data: dict[str, Any] = _body().model_dump()
    if invalid == "enum":
        data["document_type"] = "invalid"
    elif invalid == "missing":
        del data["document_type"]
    else:
        data["access"] = {"user_ids": ["bad"]}
    with pytest.raises(ValidationError):
        await _service(repo).create_document(
            tenant_id=TENANT, body=CreateDocumentRequest.model_construct(**data)
        )
    assert repo.calls == []


@pytest.mark.parametrize(
    "data",
    [
        {"ingest_status": "invalid"}, {"ingest_status": None}, {"tenant_id": OTHER},
        {"access": {"group_ids": ["bad"]}},
    ],
)
async def test_patch_invalid_fields_values_and_nested_ids(data: dict[str, Any]) -> None:
    repo = FakeDocuments()
    body = UpdateDocumentRequest.model_construct(_fields_set=set(data), **data)
    with pytest.raises(ValidationError):
        await _service(repo).update_document(tenant_id=TENANT, document_id=DOC, body=body)
    assert repo.calls == []
