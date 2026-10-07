"""Focused unit tests for chunk profile query mapping and creation."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, Literal, cast

import pytest

from app.api.schemas import CreateChunkProfileRequest
from app.db.repositories import Repositories
from app.errors import InvalidId, TenantNotFound, ValidationError
from app.models.documents import ChunkProfilesDocument, TenantsDocument
from app.services.chunk_profiles import ChunkProfilesService

TENANT_ID = "abcdef0123456789abcdef01"
PROFILE_ID = "123456789012345678901234"


class _StringIdentifier:
    """Non-string projected identifier; no BSON dependency needed."""

    def __init__(self, value: str) -> None:
        self.value = value

    def __str__(self) -> str:
        return self.value


class _ProfilesRepo:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows: list[dict[str, Any]] = rows if rows is not None else []
        self.query_calls: list[str] = []
        self.inserted: list[ChunkProfilesDocument] = []

    async def run_qp_3(self, *, tenant_id: str) -> list[dict[str, Any]]:
        self.query_calls.append(tenant_id)
        return self.rows

    async def insert_one(self, document: ChunkProfilesDocument) -> None:
        self.inserted.append(document)


class _TenantsRepo:
    def __init__(self, document: TenantsDocument | None = None) -> None:
        self.document = document
        self.calls: list[str] = []

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append(value)
        return self.document


def _service(profiles: _ProfilesRepo, tenants: _TenantsRepo) -> ChunkProfilesService:
    return ChunkProfilesService(
        cast(Repositories, SimpleNamespace(chunk_profiles=profiles, tenants=tenants))
    )


@pytest.mark.parametrize("tenant_id", ["", "a" * 23, "a" * 25, "g" * 24, "a" * 24 + "\n"])
async def test_list_invalid_id(tenant_id: str) -> None:
    profiles = _ProfilesRepo()
    tenants = _TenantsRepo()
    with pytest.raises(InvalidId) as caught:
        await _service(profiles, tenants).list_chunk_profiles(tenant_id=tenant_id)
    assert caught.value.details == {"tenant_id": tenant_id}
    assert profiles.query_calls == []
    assert tenants.calls == []
    assert profiles.inserted == []


async def test_list_maps_tenant_and_global_profiles_without_tenant_lookup() -> None:
    rows: list[dict[str, Any]] = [
        {
            "_id": _StringIdentifier(PROFILE_ID),
            "tenant_id": _StringIdentifier(TENANT_ID),
            "name": "Tenant recursive",
            "strategy": "recursive",
            "parameters": {"overlap": 20},
            "is_active": True,
            "created_at": datetime.now(UTC),
        },
        {"_id": PROFILE_ID, "name": "Global semantic", "strategy": "semantic"},
        {
            "_id": PROFILE_ID,
            "tenant_id": None,
            "name": "Global fixed",
            "strategy": "fixed_length",
            "parameters": {},
        },
    ]
    profiles = _ProfilesRepo(rows)
    tenants = _TenantsRepo()
    response = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID)
    owned, missing_owner, null_owner = response.chunk_profiles
    assert owned.id == PROFILE_ID
    assert owned.tenant_id == TENANT_ID
    assert owned.name == "Tenant recursive"
    assert owned.strategy == "recursive"
    assert owned.parameters == {"overlap": 20}
    assert missing_owner.tenant_id is None
    assert missing_owner.parameters is None
    assert null_owner.tenant_id is None
    assert null_owner.parameters == {}
    assert set(owned.model_dump(by_alias=True)) == {
        "_id",
        "name",
        "strategy",
        "parameters",
        "tenant_id",
    }
    assert profiles.query_calls == [TENANT_ID]
    assert profiles.inserted == []
    assert tenants.calls == []


async def test_list_empty_and_uppercase_identifier() -> None:
    profiles = _ProfilesRepo()
    tenants = _TenantsRepo()
    response = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID.upper())
    assert response.chunk_profiles == []
    assert profiles.query_calls == [TENANT_ID.upper()]
    assert tenants.calls == []
    assert profiles.inserted == []


@pytest.mark.parametrize("tenant_id", ["invalid", "z" * 24, "a" * 24 + "\n"])
async def test_create_invalid_identifier_before_lookup(tenant_id: str) -> None:
    profiles = _ProfilesRepo()
    tenants = _TenantsRepo()
    body = CreateChunkProfileRequest(name="Profile", strategy="contextual", is_active=True)
    with pytest.raises(ValidationError) as caught:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=tenant_id)
    assert caught.value.details == {"tenant_id": tenant_id}
    assert tenants.calls == []
    assert profiles.inserted == []
    assert profiles.query_calls == []


async def test_create_missing_tenant_does_not_insert() -> None:
    profiles = _ProfilesRepo()
    tenants = _TenantsRepo()
    body = CreateChunkProfileRequest(name="Profile", strategy="contextual", is_active=True)
    with pytest.raises(TenantNotFound) as caught:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    assert caught.value.details == {"tenant_id": TENANT_ID}
    assert tenants.calls == [TENANT_ID]
    assert profiles.inserted == []
    assert profiles.query_calls == []


@pytest.mark.parametrize("strategy", ["fixed_length", "recursive", "semantic", "contextual"])
@pytest.mark.parametrize("with_parameters", [False, True])
async def test_create_maps_stored_document_even_for_inactive_tenant(
    strategy: Literal["fixed_length", "recursive", "semantic", "contextual"],
    with_parameters: bool,
) -> None:
    before = datetime.now(UTC)
    tenant = TenantsDocument.model_validate(
        {
            "_id": TENANT_ID,
            "tenant_key": "customer",
            "name": "Customer",
            "status": "inactive",
            "created_at": before,
            "updated_at": before,
        }
    )
    tenants = _TenantsRepo(tenant)
    profiles = _ProfilesRepo()
    body = CreateChunkProfileRequest(
        name="Comparison",
        strategy=strategy,
        is_active=False,
        parameters={"chunk_size": 512, "separators": ["\n"]} if with_parameters else None,
    )
    response = await _service(profiles, tenants).create_chunk_profile(
        body=body, tenant_id=TENANT_ID
    )
    after = datetime.now(UTC)
    assert len(profiles.inserted) == 1
    document = profiles.inserted[0]
    assert document.id is not None
    assert len(document.id) == 24
    assert int(document.id, 16) >= 0
    assert document.tenant_id == TENANT_ID
    assert document.name == body.name
    assert document.strategy == strategy
    assert document.parameters == body.parameters
    assert document.is_active is False
    assert before <= document.created_at <= after
    assert document.created_at.tzinfo == UTC
    assert response.chunk_profile.model_dump() == document.model_dump()
    assert response.chunk_profile.model_dump(by_alias=True)["_id"] == document.id
    assert tenants.calls == [TENANT_ID]
    assert profiles.query_calls == []
