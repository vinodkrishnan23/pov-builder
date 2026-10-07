"""Unit tests for tenant business logic; no driver or application calls."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, Literal, cast

import pytest

from app.api.schemas import CreateTenantRequest, UpdateTenantRequest
from app.db.repositories import Repositories
from app.errors import DuplicateKeyConflict, TenantKeyConflict, TenantKeyImmutable, TenantNotFound
from app.models.documents import TenantsDocument
from app.services.tenants import TenantsService

TENANT_ID = "abcdef0123456789abcdef01"
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
        self.documents: list[TenantsDocument] = []
        self.reads: list[TenantsDocument | None] = []
        self.calls: list[str] = []
        self.lookup_ids: list[str] = []
        self.find_args: list[tuple[str | None, int]] = []
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.insert_error: DuplicateKeyConflict | None = None
        self.matched = True

    async def insert_one(self, document: TenantsDocument) -> None:
        self.calls.append("insert")
        if self.insert_error is not None:
            raise self.insert_error
        self.documents.append(document)

    async def find_many(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int = 1000
    ) -> list[TenantsDocument]:
        self.calls.append("list")
        self.find_args.append((status, limit))
        return self.documents

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append("read")
        self.lookup_ids.append(value)
        return self.reads.pop(0)

    async def update_one_by_id(self, value: str, changes: dict[str, Any]) -> bool:
        self.calls.append("update")
        self.updates.append((value, changes))
        return self.matched


def _service(repo: FakeTenantsRepo) -> TenantsService:
    return TenantsService(cast(Repositories, SimpleNamespace(tenants=repo)))


@pytest.mark.parametrize("with_optional", [False, True])
async def test_create_maps_inserted_document(with_optional: bool) -> None:
    repo = FakeTenantsRepo()
    body = CreateTenantRequest(tenant_key="demo", name="Demo tenant", status="active")
    if with_optional:
        body.deployment_model = "isolated"
        body.cloud = "gcp"
    before = datetime.now(UTC)
    response = await _service(repo).create_tenant(body=body)
    after = datetime.now(UTC)
    document = repo.documents[0]
    assert document.id is not None
    assert re.fullmatch(r"[0-9a-f]{24}", document.id)
    assert before <= document.created_at <= after
    assert document.updated_at == document.created_at
    assert response.tenant.model_dump() == document.model_dump()
    assert response.tenant.deployment_model == ("isolated" if with_optional else None)
    assert response.tenant.cloud == ("gcp" if with_optional else None)
    assert response.model_dump(by_alias=True)["tenant"]["_id"] == document.id
    assert repo.calls == ["insert"]


async def test_create_translates_duplicate_without_precheck() -> None:
    repo = FakeTenantsRepo()
    error = DuplicateKeyConflict({"tenant_key": "demo"})
    repo.insert_error = error
    with pytest.raises(TenantKeyConflict) as caught:
        await _service(repo).create_tenant(
            body=CreateTenantRequest(tenant_key="demo", name="Demo", status="active")
        )
    assert caught.value.__cause__ is error
    assert caught.value.details == {"tenant_key": "demo"}
    assert repo.calls == ["insert"]
    assert repo.documents == []


@pytest.mark.parametrize("limit", [None, 0, -3, 2])
@pytest.mark.parametrize("status", [None, "active", "inactive"])
async def test_list_forwards_filters_and_limits(
    status: Literal["active", "inactive"] | None, limit: int | None
) -> None:
    repo = FakeTenantsRepo()
    repo.documents = [_document()]
    response = await _service(repo).list_tenants(status=status, limit=limit)
    assert repo.find_args == [(status, 1000 if limit is None else limit)]
    assert response.tenants[0].model_dump() == repo.documents[0].model_dump()
    assert response.tenants[0].cloud is None
    assert response.tenants[0].deployment_model is None
    assert repo.calls == ["list"]


async def test_list_empty_is_success() -> None:
    repo = FakeTenantsRepo()
    response = await _service(repo).list_tenants()
    assert response.tenants == []
    assert repo.calls == ["list"]


async def test_get_maps_document_without_writing() -> None:
    repo = FakeTenantsRepo()
    document = _document()
    repo.reads = [document]
    response = await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert response.tenant.model_dump() == document.model_dump()
    assert response.tenant.cloud is None
    assert response.tenant.deployment_model is None
    assert repo.lookup_ids == [TENANT_ID]
    assert repo.calls == ["read"]


async def test_get_not_found() -> None:
    repo = FakeTenantsRepo()
    repo.reads = [None]
    with pytest.raises(TenantNotFound) as caught:
        await _service(repo).get_tenant(tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}
    assert repo.calls == ["read"]


async def test_update_only_explicit_fields_and_returns_reread() -> None:
    repo = FakeTenantsRepo()
    original = _document()
    updated = original.model_copy(update={"name": "Updated", "updated_at": datetime.now(UTC)})
    repo.reads = [original, updated]
    before = datetime.now(UTC)
    response = await _service(repo).update_tenant(
        body=UpdateTenantRequest(name="Updated"), tenant_id=TENANT_ID
    )
    changes = repo.updates[0][1]
    assert set(changes) == {"name", "updated_at"}
    assert changes["name"] == "Updated"
    assert before <= changes["updated_at"] <= datetime.now(UTC)
    assert response.tenant.model_dump() == updated.model_dump()
    assert response.tenant.tenant_key == original.tenant_key
    assert response.tenant.created_at == original.created_at
    assert repo.updates[0][0] == TENANT_ID
    assert repo.lookup_ids == [TENANT_ID, TENANT_ID]
    assert repo.calls == ["read", "update", "read"]


async def test_update_all_mutable_fields() -> None:
    repo = FakeTenantsRepo()
    original = _document()
    updated = original.model_copy(
        update={"name": "New", "deployment_model": "shared", "cloud": "aws", "status": "inactive"}
    )
    repo.reads = [original, updated]
    body = UpdateTenantRequest(
        name="New", deployment_model="shared", cloud="aws", status="inactive"
    )
    response = await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    changes = dict(repo.updates[0][1])
    changes.pop("updated_at")
    assert changes == body.model_dump(exclude_unset=True)
    assert response.tenant.model_dump() == updated.model_dump()


@pytest.mark.parametrize("patch", [{}, {"cloud": None, "deployment_model": None}])
async def test_update_empty_patch_and_explicit_optional_nulls(patch: dict[str, Any]) -> None:
    repo = FakeTenantsRepo()
    repo.reads = [_document(), _document()]
    response = await _service(repo).update_tenant(
        body=UpdateTenantRequest.model_validate(patch), tenant_id=TENANT_ID
    )
    changes = dict(repo.updates[0][1])
    assert isinstance(changes.pop("updated_at"), datetime)
    assert changes == patch
    assert response.tenant.cloud is None
    assert response.tenant.deployment_model is None
    assert repo.calls == ["read", "update", "read"]


@pytest.mark.parametrize("stage", ["lookup", "update", "reread"])
async def test_update_not_found_at_each_stage(stage: str) -> None:
    repo = FakeTenantsRepo()
    repo.reads = [None] if stage == "lookup" else [_document(), None]
    repo.matched = stage != "update"
    with pytest.raises(TenantNotFound) as caught:
        await _service(repo).update_tenant(body=UpdateTenantRequest(), tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}
    expected = {
        "lookup": ["read"],
        "update": ["read", "update"],
        "reread": ["read", "update", "read"],
    }
    assert repo.calls == expected[stage]


async def test_observable_immutable_attempt_is_rejected_before_reads() -> None:
    repo = FakeTenantsRepo()
    # The frozen schema normally discards extras. Simulate an observable fields-set
    # attempt without altering that schema or the service's signature.
    body = UpdateTenantRequest.model_construct(_fields_set={"tenant_key"})
    with pytest.raises(TenantKeyImmutable) as caught:
        await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    assert caught.value.details == {"field": "tenant_key"}
    assert repo.calls == []


async def test_discarded_tenant_key_cannot_be_detected_or_written() -> None:
    repo = FakeTenantsRepo()
    repo.reads = [_document(), _document()]
    body = UpdateTenantRequest.model_validate({"tenant_key": "demo"})
    assert "tenant_key" not in body.model_fields_set
    await _service(repo).update_tenant(body=body, tenant_id=TENANT_ID)
    assert set(repo.updates[0][1]) == {"updated_at"}
