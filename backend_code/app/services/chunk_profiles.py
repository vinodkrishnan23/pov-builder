"""Business logic for the chunk_profiles resource."""

from __future__ import annotations

import re
from secrets import token_hex
from typing import Any

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
from app.types import OBJECT_ID_PATTERN, utc_now


class ChunkProfilesService:
    """Operations: listChunkProfiles, createChunkProfile."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def list_chunk_profiles(self, *, tenant_id: str) -> ListChunkProfilesResponse:
        """List active tenant/global profiles through QP-3, without a tenant lookup.

        Errors: InvalidId for invalid tenant identifier syntax.
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
            owner = row.get("tenant_id")
            data["tenant_id"] = str(owner) if owner is not None else None
            data["parameters"] = row.get("parameters")
            items.append(ListChunkProfilesResponseChunkProfilesItem.model_validate(data))
        return ListChunkProfilesResponse(chunk_profiles=items)

    async def create_chunk_profile(
        self, *, body: CreateChunkProfileRequest, tenant_id: str
    ) -> CreateChunkProfileResponse:
        """Insert a tenant-specific profile; do not execute chunking.

        Body fields and enums are validated by the request schema.
        Errors: ValidationError for invalid identifier syntax, TenantNotFound on lookup miss.
        """
        if re.fullmatch(OBJECT_ID_PATTERN, tenant_id) is None:
            raise ValidationError(
                "tenantId must be a 24-character hex string.", details={"tenant_id": tenant_id}
            )
        tenant = await self.repos.tenants.find_one_by_id(tenant_id)
        if tenant is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        data = body.model_dump()
        data.update(id=token_hex(12), tenant_id=tenant_id, created_at=utc_now())
        document = ChunkProfilesDocument.model_validate(data)
        await self.repos.chunk_profiles.insert_one(document)
        return CreateChunkProfileResponse(
            chunk_profile=CreateChunkProfileResponseChunkProfile.model_validate(
                document.model_dump()
            )
        )
