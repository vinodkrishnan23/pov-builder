"""Focused chunk-profile service tests, without database or HTTP access."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.api.schemas import CreateChunkProfileRequest
from app.db.repositories import Repositories
from app.errors import DuplicateKeyConflict, InvalidId, TenantNotFound, ValidationError
from app.models.documents import ChunkProfilesDocument, TenantsDocument
from app.services.chunk_profiles import ChunkProfilesService

TENANT_ID = "abcdef0123456789abcdef01"
PROFILE_ID = "0123456789abcdef01234567"


class FakeIdentifier:
    def __init__(self, value: str) -> None:
        self.value = value

    def __str__(self) -> str:
        return self.value


class FakeProfiles:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows: list[dict[str, Any]] = rows or []
        self.calls: list[str] = []
        self.inserted: list[ChunkProfilesDocument] = []
        self.error: DuplicateKeyConflict | None = None

    async def run_qp_3(self, *, tenant_id: str) -> list[dict[str, Any]]:
        self.calls.append(tenant_id)
        return self.rows

    async def insert_one(self, document: ChunkProfilesDocument) -> None:
        if self.error is not None:
            raise self.error
        self.inserted.append(document)


class FakeTenants:
    def __init__(self, *, exists: bool = True) -> None:
        now = datetime.now(UTC)
        self.document = (
            TenantsDocument(
                _id=TENANT_ID,
                tenant_key="test",
                name="Test",
                status="inactive",
                created_at=now,
                updated_at=now,
            )
            if exists
            else None
        )
        self.calls: list[str] = []

    async def find_one_by_id(self, value: str) -> TenantsDocument | None:
        self.calls.append(value)
        return self.document


def _service(profiles: FakeProfiles, tenants: FakeTenants) -> ChunkProfilesService:
    return ChunkProfilesService(
        cast(Repositories, SimpleNamespace(chunk_profiles=profiles, tenants=tenants))
    )


@pytest.mark.parametrize("tenant_id", ["", "abc", "g" * 24, "a" * 25, "a" * 24 + "\n"])
async def test_invalid_list_id(tenant_id: str) -> None:
    profiles, tenants = FakeProfiles(), FakeTenants()
    with pytest.raises(InvalidId) as error:
        await _service(profiles, tenants).list_chunk_profiles(tenant_id=tenant_id)
    assert error.value.details == {"tenant_id": tenant_id}
    assert profiles.calls == tenants.calls == []
    assert profiles.inserted == []


async def test_list_mapping_and_no_tenant_prerequisite() -> None:
    profiles = FakeProfiles(
        [
            {
                "_id": FakeIdentifier(PROFILE_ID),
                "name": "Tenant",
                "strategy": "semantic",
                "tenant_id": FakeIdentifier(TENANT_ID),
                "parameters": {"custom": [1, "x"]},
                "is_active": True,
                "created_at": datetime.now(UTC),
            },
            {"_id": PROFILE_ID, "name": "Global", "strategy": "fixed_length", "tenant_id": None},
            {"_id": PROFILE_ID, "name": "Other global", "strategy": "recursive", "parameters": {}},
        ]
    )
    tenants = FakeTenants(exists=False)
    result = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID)
    assert profiles.calls == [TENANT_ID]
    assert tenants.calls == []
    assert profiles.inserted == []
    first, second, third = result.chunk_profiles
    assert first.id == PROFILE_ID
    assert first.tenant_id == TENANT_ID
    assert first.parameters == {"custom": [1, "x"]}
    assert second.parameters is None and second.tenant_id is None
    assert third.parameters == {} and third.tenant_id is None
    assert "created_at" not in first.model_dump()
    assert "is_active" not in first.model_dump()


async def test_empty_list_is_success() -> None:
    profiles, tenants = FakeProfiles(), FakeTenants(exists=False)
    result = await _service(profiles, tenants).list_chunk_profiles(tenant_id=TENANT_ID.upper())
    assert result.chunk_profiles == []
    assert profiles.calls == [TENANT_ID.upper()]
    assert tenants.calls == []


@pytest.mark.parametrize("parameters", [None, {}, {"arbitrary": {"key": [True, 1]}}])
async def test_create_mapping(parameters: dict[str, Any] | None) -> None:
    profiles, tenants = FakeProfiles(), FakeTenants()
    body = CreateChunkProfileRequest(
        name="Comparison", strategy="contextual", parameters=parameters, is_active=False
    )
    before = datetime.now(UTC)
    result = await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    after = datetime.now(UTC)
    assert tenants.calls == [TENANT_ID]
    assert profiles.calls == []
    assert len(profiles.inserted) == 1
    document = profiles.inserted[0]
    assert document.id is not None and re.fullmatch(r"[0-9a-f]{24}", document.id)
    assert document.tenant_id == TENANT_ID
    assert before <= document.created_at <= after
    assert document.created_at.utcoffset() == UTC.utcoffset(document.created_at)
    assert result.chunk_profile.model_dump() == document.model_dump()
    assert result.chunk_profile.name == body.name
    assert result.chunk_profile.strategy == body.strategy
    assert result.chunk_profile.parameters == parameters
    assert result.chunk_profile.is_active is False


async def test_missing_tenant_prevents_insert() -> None:
    profiles, tenants = FakeProfiles(), FakeTenants(exists=False)
    body = CreateChunkProfileRequest(name="Test", strategy="semantic", is_active=True)
    with pytest.raises(TenantNotFound) as error:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    assert error.value.details == {"tenant_id": TENANT_ID}
    assert tenants.calls == [TENANT_ID]
    assert profiles.inserted == []


async def test_invalid_create_id_prevents_lookup() -> None:
    profiles, tenants = FakeProfiles(), FakeTenants()
    body = CreateChunkProfileRequest(name="Test", strategy="semantic", is_active=True)
    with pytest.raises(ValidationError):
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id="bad")
    assert tenants.calls == []
    assert profiles.inserted == []


@pytest.mark.parametrize(
    "data",
    [
        {"strategy": "semantic", "is_active": True},
        {"name": "Test", "is_active": True},
        {"name": "Test", "strategy": "semantic"},
        {"name": "Test", "strategy": "unknown", "is_active": True},
    ],
)
async def test_unvalidated_body_rejected(data: dict[str, Any]) -> None:
    profiles, tenants = FakeProfiles(), FakeTenants()
    body = CreateChunkProfileRequest.model_construct(**data)
    with pytest.raises(ValidationError):
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    assert tenants.calls == []
    assert profiles.inserted == []


async def test_insert_errors_are_not_swallowed_or_remapped() -> None:
    profiles, tenants = FakeProfiles(), FakeTenants()
    profiles.error = DuplicateKeyConflict()
    body = CreateChunkProfileRequest(name="Test", strategy="semantic", is_active=True)
    with pytest.raises(DuplicateKeyConflict) as error:
        await _service(profiles, tenants).create_chunk_profile(body=body, tenant_id=TENANT_ID)
    assert error.value is profiles.error
