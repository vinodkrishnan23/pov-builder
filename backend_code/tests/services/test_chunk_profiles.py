"""Isolated service tests for chunk profile query binding and insertion."""

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
PROFILE_ID = "1234567890abcdef12345678"


class IdValue:
    """Stand-in for a projected BSON identifier without using a driver."""

    def __init__(self, value: str) -> None:
        self.value = value

    def __str__(self) -> str:
        return self.value


class FakeProfiles:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.query_calls: list[str] = []
        self.inserted: list[ChunkProfilesDocument] = []

    async def run_qp_3(self, *, tenant_id: str) -> list[dict[str, Any]]:
        self.query_calls.append(tenant_id)
        return self.rows

    async def insert_one(self, document: ChunkProfilesDocument) -> None:
        self.inserted.append(document)


class FakeTenants:
    def __init__(self, *, exists: bool) -> None:
        self.calls: list[str] = []
        self.document = (
            TenantsDocument(
                _id=TENANT_ID,
                tenant_key="test",
                name="Tenant",
                status="active",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            if exists
            else None
        )

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append(value)
        return self.document


def _service(profiles: FakeProfiles, tenants: FakeTenants) -> ChunkProfilesService:
    return ChunkProfilesService(
        cast(Repositories, SimpleNamespace(chunk_profiles=profiles, tenants=tenants))
    )


@pytest.mark.parametrize("invalid_id", ["", "a" * 23, "a" * 25, "g" * 24, "a" * 24 + "\n"])
async def test_list_invalid_id_before_query(invalid_id: str) -> None:
    profiles = FakeProfiles([])
    tenants = FakeTenants(exists=False)
    with pytest.raises(InvalidId) as raised:
        await _service(profiles, tenants).list_chunk_profiles(tenant_id=invalid_id)
    assert raised.value.details == {"tenant_id": invalid_id}
    assert profiles.query_calls == []
    assert profiles.inserted == []
    assert tenants.calls == []


async def test_list_mapping_and_global_scope_without_tenant_lookup() -> None:
    rows: list[dict[str, Any]] = [
        {
            "_id": IdValue(PROFILE_ID),
            "name": "Tenant profile",
            "strategy": "fixed_length",
            "parameters": {"chunk_size": 256},
            "tenant_id": IdValue(TENANT_ID),
            "is_active": True,
            "created_at": datetime.now(UTC),
        },
        {"_id": PROFILE_ID, "name": "Global", "strategy": "recursive"},
        {
            "_id": PROFILE_ID,
            "name": "Global null",
            "strategy": "contextual",
            "tenant_id": None,
            "parameters": None,
        },
    ]
    profiles = FakeProfiles(rows)
    tenants = FakeTenants(exists=False)
    response = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID)
    assert profiles.query_calls == [TENANT_ID]
    assert tenants.calls == []
    assert profiles.inserted == []
    first, second, third = response.chunk_profiles
    assert first.id == PROFILE_ID
    assert first.tenant_id == TENANT_ID
    assert first.name == "Tenant profile"
    assert first.strategy == "fixed_length"
    assert first.parameters == {"chunk_size": 256}
    assert second.tenant_id is None and second.parameters is None
    assert third.tenant_id is None and third.parameters is None
    assert set(first.model_dump(by_alias=True)) == {
        "_id",
        "name",
        "strategy",
        "parameters",
        "tenant_id",
    }
    assert rows[0]["_id"].__class__ is IdValue


async def test_list_empty_and_uppercase_id() -> None:
    profiles = FakeProfiles([])
    tenants = FakeTenants(exists=False)
    response = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID.upper())
    assert response.chunk_profiles == []
    assert profiles.query_calls == [TENANT_ID.upper()]
    assert tenants.calls == []
    assert profiles.inserted == []


@pytest.mark.parametrize("invalid_id", ["", "z" * 24, "a" * 23, "a" * 25])
async def test_create_invalid_id_before_lookup(invalid_id: str) -> None:
    profiles = FakeProfiles([])
    tenants = FakeTenants(exists=True)
    body = CreateChunkProfileRequest(name="Test", strategy="semantic", is_active=True)
    with pytest.raises(ValidationError) as raised:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=invalid_id)
    assert raised.value.details == {"tenant_id": invalid_id}
    assert tenants.calls == []
    assert profiles.inserted == []


async def test_create_missing_tenant_does_not_insert() -> None:
    profiles = FakeProfiles([])
    tenants = FakeTenants(exists=False)
    body = CreateChunkProfileRequest(name="Test", strategy="semantic", is_active=True)
    with pytest.raises(TenantNotFound) as raised:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    assert raised.value.details == {"tenant_id": TENANT_ID}
    assert tenants.calls == [TENANT_ID]
    assert profiles.inserted == []
    assert profiles.query_calls == []


@pytest.mark.parametrize("strategy", ["fixed_length", "recursive", "semantic", "contextual"])
@pytest.mark.parametrize("with_parameters", [False, True])
async def test_create_record_and_response(
    strategy: Literal["fixed_length", "recursive", "semantic", "contextual"],
    with_parameters: bool,
) -> None:
    profiles = FakeProfiles([])
    tenants = FakeTenants(exists=True)
    body = CreateChunkProfileRequest(
        name="Comparison",
        strategy=strategy,
        is_active=False,
        parameters={"overlap": 12} if with_parameters else None,
    )
    before = datetime.now(UTC)
    response = await _service(profiles, tenants).create_chunk_profile(
        body=body, tenant_id=TENANT_ID
    )
    after = datetime.now(UTC)
    assert tenants.calls == [TENANT_ID]
    assert profiles.query_calls == []
    assert len(profiles.inserted) == 1
    document = profiles.inserted[0]
    assert document.id is not None and len(document.id) == 24
    assert int(document.id, 16) >= 0
    assert document.tenant_id == TENANT_ID
    assert document.name == body.name
    assert document.strategy == strategy
    assert document.parameters == body.parameters
    assert document.is_active is False
    assert before <= document.created_at <= after
    assert document.created_at.tzinfo == UTC
    assert response.chunk_profile.model_dump() == document.model_dump()
    assert response.model_dump(by_alias=True)["chunk_profile"]["_id"] == document.id
