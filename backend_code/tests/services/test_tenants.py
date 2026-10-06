"""Isolated unit tests for tenant CRUD business logic."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, Literal, cast

import pytest
from pydantic import ConfigDict

from app.api.schemas import CreateTenantRequest, UpdateTenantRequest
from app.db.repositories import Repositories
from app.errors import (
    DuplicateKeyConflict,
    InvalidId,
    TenantKeyConflict,
    TenantKeyImmutable,
    TenantNotFound,
    ValidationError,
)
from app.models.documents import TenantsDocument
from app.services.tenants import TenantsService

TENANT_ID = "0123456789abcdef01234567"
CREATED_AT = datetime(2024, 1, 1, tzinfo=UTC)


class FakeTenantsRepo:
    def __init__(self, document: TenantsDocument | None = None) -> None:
        self.document = document
        self.documents: list[TenantsDocument] = []
        self.inserted: list[TenantsDocument] = []
        self.read_ids: list[str] = []
        self.find_calls: list[tuple[Literal["active", "inactive"] | None, int]] = []
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.duplicate = False
        self.matched = True

    async def insert_one(self, document: TenantsDocument) -> None:
        self.inserted.append(document)
        if self.duplicate:
            raise DuplicateKeyConflict({"tenant_key": document.tenant_key})

    async def find_many(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int = 1000
    ) -> list[TenantsDocument]:
        self.find_calls.append((status, limit))
        return self.documents

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.read_ids.append(value)
        return self.document

    async def update_one_by_id(self, value: str, changes: dict[str, Any]) -> bool:
        self.updates.append((value, changes))
        if self.matched and self.document is not None:
            self.document = TenantsDocument.model_validate(
                {**self.document.model_dump(), **changes}
            )
        return self.matched


class ObservableExtraPatch(UpdateTenantRequest):
    """Exercise extras only when they survive model validation."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)


def _service(repo: FakeTenantsRepo) -> TenantsService:
    return TenantsService(cast(Repositories, SimpleNamespace(tenants=repo)))


def _document() -> TenantsDocument:
    return TenantsDocument(
        _id=TENANT_ID,
        tenant_key="demo",
        name="Demo tenant",
        deployment_model="shared",
        cloud="aws",
        status="active",
        created_at=CREATED_AT,
        updated_at=CREATED_AT,
    )


@pytest.mark.parametrize("with_optional", [False, True])
async def test_create_maps_inserted_document(with_optional: bool) -> None:
    repo = FakeTenantsRepo()
    body = CreateTenantRequest(
        tenant_key="demo",
        name="Demo tenant",
        status="active",
        deployment_model="isolated" if with_optional else None,
        cloud="gcp" if with_optional else None,
    )
    before = datetime.now(UTC)
    result = await _service(repo).create_tenant(body=body)
    after = datetime.now(UTC)
    assert len(repo.inserted) == 1
    document = repo.inserted[0]
    assert document.id is not None and len(document.id) == 24
    assert int(document.id, 16) >= 0
    assert before <= document.created_at <= after
    assert document.created_at == document.updated_at
    assert document.created_at.tzinfo == UTC
    assert result.tenant.model_dump() == document.model_dump()
    assert result.tenant.deployment_model == body.deployment_model
    assert result.tenant.cloud == body.cloud
    assert result.model_dump(by_alias=True)["tenant"]["_id"] == document.id
    assert repo.read_ids == []


async def test_duplicate_key_is_translated_without_pre_read() -> None:
    repo = FakeTenantsRepo()
    repo.duplicate = True
    body = CreateTenantRequest(tenant_key="demo", name="Demo", status="active")
    with pytest.raises(TenantKeyConflict) as caught:
        await _service(repo).create_tenant(body=body)
    assert isinstance(caught.value.__cause__, DuplicateKeyConflict)
    assert caught.value.details == {"tenant_key": "demo"}
    assert len(repo.inserted) == 1
    assert repo.read_ids == []


@pytest.mark.parametrize("limit", [None, 0, -2, 1])
async def test_list_forwards_limits_without_invented_bounds(limit: int | None) -> None:
    repo = FakeTenantsRepo()
    result = await _service(repo).list_tenants(limit=limit)
    assert result.tenants == []
    assert repo.find_calls == [(None, 1000 if limit is None else limit)]
    assert repo.updates == []
    assert repo.inserted == []


async def test_list_status_filter_and_response_mapping() -> None:
    repo = FakeTenantsRepo()
    document = _document()
    repo.documents = [document]
    result = await _service(repo).list_tenants(status="active", limit=5)
    assert repo.find_calls == [("active", 5)]
    assert result.tenants[0].model_dump() == document.model_dump()
    assert repo.read_ids == []


async def test_get_maps_nullable_fields_and_id() -> None:
    document = _document()
    document.cloud = None
    document.deployment_model = None
    repo = FakeTenantsRepo(document)
    result = await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert repo.read_ids == [TENANT_ID]
    assert result.tenant.model_dump() == document.model_dump()
    assert result.tenant.cloud is None
    assert result.tenant.deployment_model is None
    assert repo.updates == []


async def test_get_missing_tenant() -> None:
    repo = FakeTenantsRepo()
    with pytest.raises(TenantNotFound) as caught:
        await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}


@pytest.mark.parametrize("tenant_id", ["", "a" * 23, "g" * 24, "a" * 25, "a" * 24 + "\n"])
async def test_invalid_ids_raise_operation_specific_errors(tenant_id: str) -> None:
    repo = FakeTenantsRepo()
    service = _service(repo)
    with pytest.raises(InvalidId):
        await service.get_tenant(tenant_id=tenant_id)
    with pytest.raises(ValidationError):
        await service.update_tenant(tenant_id=tenant_id, body=UpdateTenantRequest())
    assert repo.read_ids == []
    assert repo.updates == []


async def test_update_only_explicit_fields_and_rereads() -> None:
    original = _document()
    repo = FakeTenantsRepo(original)
    before = datetime.now(UTC)
    result = await _service(repo).update_tenant(
        tenant_id=TENANT_ID, body=UpdateTenantRequest(name="Renamed", cloud=None)
    )
    after = datetime.now(UTC)
    assert repo.read_ids == [TENANT_ID]
    updated_id, changes = repo.updates[0]
    assert updated_id == TENANT_ID
    assert set(changes) == {"name", "cloud", "updated_at"}
    assert changes["name"] == "Renamed"
    assert changes["cloud"] is None
    assert before <= result.tenant.updated_at <= after
    assert result.tenant.name == "Renamed"
    assert result.tenant.cloud is None
    assert result.tenant.tenant_key == original.tenant_key
    assert result.tenant.created_at == original.created_at
    assert result.tenant.id == original.id
    assert result.tenant.deployment_model == "shared"
    assert result.tenant.status == "active"
    assert repo.document is not None
    assert result.tenant.model_dump() == repo.document.model_dump()


async def test_empty_patch_updates_timestamp_only() -> None:
    repo = FakeTenantsRepo(_document())
    result = await _service(repo).update_tenant(tenant_id=TENANT_ID, body=UpdateTenantRequest())
    assert set(repo.updates[0][1]) == {"updated_at"}
    assert result.tenant.name == "Demo tenant"


@pytest.mark.parametrize("matched", [False, True])
async def test_update_not_found_or_missing_reread(matched: bool) -> None:
    repo = FakeTenantsRepo()
    repo.matched = matched
    with pytest.raises(TenantNotFound):
        await _service(repo).update_tenant(
            tenant_id=TENANT_ID, body=UpdateTenantRequest(status="inactive")
        )
    assert len(repo.updates) == 1
    assert repo.read_ids == ([TENANT_ID] if matched else [])


@pytest.mark.parametrize("field", ["name", "status"])
async def test_patch_null_required_stored_fields_is_invalid(field: str) -> None:
    repo = FakeTenantsRepo(_document())
    body = UpdateTenantRequest.model_validate({field: None})
    with pytest.raises(ValidationError) as caught:
        await _service(repo).update_tenant(tenant_id=TENANT_ID, body=body)
    assert caught.value.details == {"field": field}
    assert repo.updates == []
    assert repo.read_ids == []


@pytest.mark.parametrize("key", ["demo", "changed", None])
async def test_observable_tenant_key_attempt_is_immutable(key: str | None) -> None:
    repo = FakeTenantsRepo(_document())
    body = ObservableExtraPatch.model_validate({"tenant_key": key, "name": "Changed"})
    with pytest.raises(TenantKeyImmutable):
        await _service(repo).update_tenant(tenant_id=TENANT_ID, body=body)
    assert repo.updates == []
    assert repo.read_ids == []


async def test_generated_model_discards_tenant_key_extra() -> None:
    repo = FakeTenantsRepo(_document())
    body = UpdateTenantRequest.model_validate({"tenant_key": "changed", "name": "New"})
    assert "tenant_key" not in body.model_dump()
    result = await _service(repo).update_tenant(tenant_id=TENANT_ID, body=body)
    assert result.tenant.tenant_key == "demo"
    assert result.tenant.name == "New"
    assert "tenant_key" not in repo.updates[0][1]
