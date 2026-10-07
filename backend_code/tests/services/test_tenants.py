"""Tenant service tests using only in-memory repositories."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, Literal, cast

import pytest

from app.api.schemas import CreateTenantRequest, UpdateTenantRequest
from app.db.repositories import Repositories
from app.errors import (
    DuplicateKeyConflict,
    TenantKeyConflict,
    TenantKeyImmutable,
    TenantNotFound,
    ValidationError,
)
from app.models.documents import TenantsDocument
from app.services.tenants import TenantsService

TENANT_ID = "0123456789abcdef01234567"
CREATED = datetime(2024, 1, 1, tzinfo=UTC)


def _document() -> TenantsDocument:
    return TenantsDocument(
        _id=TENANT_ID,
        tenant_key="demo",
        name="Demo tenant",
        status="active",
        created_at=CREATED,
        updated_at=CREATED,
    )


class FakeTenantsRepo:
    def __init__(self) -> None:
        self.inserted: list[TenantsDocument] = []
        self.duplicate = False
        self.documents: list[TenantsDocument] = []
        self.list_calls: list[tuple[str | None, int]] = []
        self.reads: list[TenantsDocument | None] = []
        self.read_calls: list[str] = []
        self.update_calls: list[tuple[str, dict[str, Any]]] = []
        self.matched = True

    async def insert_one(self, document: TenantsDocument) -> None:
        if self.duplicate:
            raise DuplicateKeyConflict({"tenant_key": document.tenant_key})
        self.inserted.append(document)

    async def find_many(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int = 1000
    ) -> list[TenantsDocument]:
        self.list_calls.append((status, limit))
        return self.documents

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.read_calls.append(value)
        return self.reads.pop(0)

    async def update_one_by_id(self, value: str, changes: dict[str, Any]) -> bool:
        self.update_calls.append((value, dict(changes)))
        return self.matched


def _service(repo: FakeTenantsRepo) -> TenantsService:
    return TenantsService(cast(Repositories, SimpleNamespace(tenants=repo)))


@pytest.mark.parametrize("with_options", [False, True])
async def test_create_maps_inserted_document(with_options: bool) -> None:
    repo = FakeTenantsRepo()
    body = CreateTenantRequest(
        tenant_key="demo",
        name="Demo tenant",
        status="active",
        deployment_model="shared" if with_options else None,
        cloud="aws" if with_options else None,
    )
    before = datetime.now(UTC)
    response = await _service(repo).create_tenant(body=body)
    after = datetime.now(UTC)
    document = repo.inserted[0]
    assert response.tenant.model_dump() == document.model_dump()
    assert document.id is not None
    assert len(document.id) == 24
    assert all(char in "0123456789abcdef" for char in document.id)
    assert before <= document.created_at <= after
    assert document.updated_at == document.created_at
    serialized = response.model_dump(mode="json", by_alias=True)["tenant"]
    assert serialized["_id"] == document.id
    assert serialized["created_at"].endswith("Z")
    assert response.tenant.cloud == body.cloud
    assert response.tenant.deployment_model == body.deployment_model
    assert not repo.read_calls
    assert not repo.update_calls


async def test_create_translates_duplicate_key() -> None:
    repo = FakeTenantsRepo()
    repo.duplicate = True
    with pytest.raises(TenantKeyConflict) as caught:
        await _service(repo).create_tenant(
            body=CreateTenantRequest(tenant_key="demo", name="Demo", status="active")
        )
    assert caught.value.details == {"tenant_key": "demo"}
    assert isinstance(caught.value.__cause__, DuplicateKeyConflict)
    assert not repo.inserted


@pytest.mark.parametrize("limit", [None, 1, 0, -2])
async def test_list_passes_filter_and_limit_without_new_constraints(limit: int | None) -> None:
    repo = FakeTenantsRepo()
    document = _document()
    repo.documents = [document]
    response = await _service(repo).list_tenants(status="active", limit=limit)
    assert repo.list_calls == [("active", 1000 if limit is None else limit)]
    assert response.tenants[0].model_dump() == document.model_dump()
    assert response.tenants[0].cloud is None
    assert response.tenants[0].deployment_model is None
    assert not repo.inserted
    assert not repo.update_calls
    assert not repo.read_calls


async def test_list_empty_with_defaults() -> None:
    repo = FakeTenantsRepo()
    response = await _service(repo).list_tenants()
    assert response.tenants == []
    assert repo.list_calls == [(None, 1000)]


async def test_get_maps_document_without_writes() -> None:
    repo = FakeTenantsRepo()
    document = _document()
    repo.reads = [document]
    response = await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert response.tenant.model_dump() == document.model_dump()
    assert response.model_dump(by_alias=True)["tenant"]["_id"] == TENANT_ID
    assert repo.read_calls == [TENANT_ID]
    assert not repo.inserted
    assert not repo.update_calls


async def test_get_missing_tenant() -> None:
    repo = FakeTenantsRepo()
    repo.reads = [None]
    with pytest.raises(TenantNotFound) as caught:
        await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}


async def test_update_explicit_fields_and_reads_back_persisted_record() -> None:
    repo = FakeTenantsRepo()
    existing = _document()
    updated = existing.model_copy(
        update={"name": "Persisted name", "cloud": "gcp", "updated_at": datetime.now(UTC)}
    )
    repo.reads = [existing, updated]
    response = await _service(repo).update_tenant(
        body=UpdateTenantRequest(name="Requested name", cloud="gcp"), tenant_id=TENANT_ID
    )
    assert repo.read_calls == [TENANT_ID, TENANT_ID]
    value, changes = repo.update_calls[0]
    assert value == TENANT_ID
    assert set(changes) == {"name", "cloud", "updated_at"}
    assert changes["name"] == "Requested name"
    assert changes["cloud"] == "gcp"
    assert isinstance(changes["updated_at"], datetime)
    assert changes["updated_at"].tzinfo == UTC
    assert response.tenant.model_dump() == updated.model_dump()
    assert response.tenant.tenant_key == existing.tenant_key
    assert response.tenant.created_at == existing.created_at
    assert not repo.inserted


@pytest.mark.parametrize("clear_optional", [False, True])
async def test_update_empty_patch_and_explicit_optional_null(clear_optional: bool) -> None:
    repo = FakeTenantsRepo()
    repo.reads = [_document(), _document()]
    body = UpdateTenantRequest(cloud=None) if clear_optional else UpdateTenantRequest()
    await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    changes = repo.update_calls[0][1]
    assert set(changes) == ({"cloud", "updated_at"} if clear_optional else {"updated_at"})
    if clear_optional:
        assert changes["cloud"] is None


@pytest.mark.parametrize("stage", ["prerequisite", "unmatched", "readback"])
async def test_update_not_found_at_each_stage(stage: str) -> None:
    repo = FakeTenantsRepo()
    repo.reads = [None] if stage == "prerequisite" else [_document(), None]
    repo.matched = stage != "unmatched"
    with pytest.raises(TenantNotFound) as caught:
        await _service(repo).update_tenant(body=UpdateTenantRequest(), tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}
    assert len(repo.update_calls) == (0 if stage == "prerequisite" else 1)
    assert len(repo.read_calls) == (2 if stage == "readback" else 1)


@pytest.mark.parametrize("field", ["name", "status"])
async def test_update_rejects_null_required_stored_fields(field: str) -> None:
    repo = FakeTenantsRepo()
    body = UpdateTenantRequest.model_validate({field: None})
    with pytest.raises(ValidationError) as caught:
        await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    assert caught.value.details == {"field": field}
    assert not repo.read_calls
    assert not repo.update_calls


async def test_observable_immutable_key_is_rejected_even_if_unchanged() -> None:
    repo = FakeTenantsRepo()
    # Normal validation discards extras; simulate an observable attempt on a
    # constructed model without changing the generated schema.
    body = UpdateTenantRequest.model_construct(_fields_set={"tenant_key"})
    with pytest.raises(TenantKeyImmutable):
        await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    assert not repo.read_calls
    assert not repo.update_calls


async def test_generated_patch_model_discards_immutable_key_attempt() -> None:
    repo = FakeTenantsRepo()
    repo.reads = [_document(), _document()]
    body = UpdateTenantRequest.model_validate({"tenant_key": "demo"})
    assert "tenant_key" not in body.model_fields_set
    assert body.model_extra is None
    await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    assert set(repo.update_calls[0][1]) == {"updated_at"}
