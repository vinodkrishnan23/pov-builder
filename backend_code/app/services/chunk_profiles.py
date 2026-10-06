"""Business logic for the `chunk_profiles` resource."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from secrets import token_hex
from typing import Any

from pydantic import ValidationError as PydanticValidationError

from app.api.schemas import (
    CreateChunkProfileRequest,
    CreateChunkProfileResponse,
    CreateChunkProfileResponseChunkProfile,
    ListChunkProfilesResponse,
    ListChunkProfilesResponseChunkProfilesItem,
)
from app.db.repositories import Repositories
from app.errors import InvalidId, TenantNotFound, ValidationError
from app.models.documents import ChunkProfilesDocument
from app.types import OBJECT_ID_PATTERN


class ChunkProfilesService:
    """Operations: listChunkProfiles, createChunkProfile."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def list_chunk_profiles(self, *, tenant_id: str) -> ListChunkProfilesResponse:
        """listChunkProfiles: QP-3, with INVALID_ID for invalid tenant identifiers.

        No tenant prerequisite; empty results succeed. Convert projected identifiers
        to strings and absent parameters/tenant_id to null. No writes.
        """
        if re.fullmatch(OBJECT_ID_PATTERN, tenant_id) is None:
            raise InvalidId(
                "tenantId must be a 24-character hex string.", details={"tenant_id": tenant_id}
            )

        rows = await self.repos.chunk_profiles.run_qp_3(tenant_id=tenant_id)
        items: list[ListChunkProfilesResponseChunkProfilesItem] = []
        for row in rows:
            data: dict[str, Any] = dict(row)
            data["_id"] = str(row["_id"])
            data["tenant_id"] = str(row["tenant_id"]) if row.get("tenant_id") is not None else None
            data["parameters"] = row.get("parameters")
            items.append(ListChunkProfilesResponseChunkProfilesItem.model_validate(data))
        return ListChunkProfilesResponse(chunk_profiles=items)

    async def create_chunk_profile(
        self, *, body: CreateChunkProfileRequest, tenant_id: str
    ) -> CreateChunkProfileResponse:
        """createChunkProfile: insert a tenant-specific profile with generated id/UTC time.

        Invalid input -> VALIDATION_ERROR. Tenant lookup returning None ->
        TENANT_NOT_FOUND. Arbitrary parameter keys and inactive profiles are allowed.
        No chunking execution, global writes or uniqueness error mapping is declared.
        """
        if re.fullmatch(OBJECT_ID_PATTERN, tenant_id) is None:
            raise ValidationError(
                "tenantId must be a 24-character hex string.", details={"tenant_id": tenant_id}
            )
        try:
            validated_body = CreateChunkProfileRequest.model_validate(body.model_dump())
        except PydanticValidationError as error:
            raise ValidationError(
                "Missing required fields or invalid field values.",
                details={"fields": [str(item["loc"][0]) for item in error.errors()]},
            ) from error

        tenant = await self.repos.tenants.find_one_by_id(tenant_id)
        if tenant is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})

        data: dict[str, Any] = validated_body.model_dump()
        data.update(id=token_hex(12), tenant_id=tenant_id, created_at=datetime.now(UTC))
        document = ChunkProfilesDocument.model_validate(data)
        await self.repos.chunk_profiles.insert_one(document)
        profile = CreateChunkProfileResponseChunkProfile.model_validate(document.model_dump())
        return CreateChunkProfileResponse(chunk_profile=profile)
