"""Business logic for the tenants resource."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from secrets import token_hex
from typing import Literal

from app.api.schemas import (
    CreateTenantRequest,
    CreateTenantResponse,
    GetTenantResponse,
    ListTenantsResponse,
    ListTenantsResponseTenantsItem,
    UpdateTenantRequest,
    UpdateTenantResponse,
)
from app.db.base import MAX_FIND_RESULTS
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
from app.types import OBJECT_ID_PATTERN


class TenantsService:
    """Operations: createTenant, listTenants, getTenant, updateTenant."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_tenant(self, *, body: CreateTenantRequest) -> CreateTenantResponse:
        """Insert a tenant; translate unique tenant_key conflicts to TenantKeyConflict."""
        now = datetime.now(UTC)
        data = body.model_dump(
            include={"tenant_key", "name", "deployment_model", "cloud", "status"}
        )
        data.update(id=token_hex(12), created_at=now, updated_at=now)
        document = TenantsDocument.model_validate(data)
        try:
            await self.repos.tenants.insert_one(document)
        except DuplicateKeyConflict as error:
            raise TenantKeyConflict(
                "A tenant with this tenant_key already exists.",
                details={"tenant_key": body.tenant_key},
            ) from error
        return CreateTenantResponse.model_validate({"tenant": document.model_dump()})

    async def list_tenants(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int | None = None
    ) -> ListTenantsResponse:
        """Read tenants with the optional status filter and repository default limit."""
        effective_limit = MAX_FIND_RESULTS if limit is None else limit
        if status is None:
            documents = await self.repos.tenants.find_many(limit=effective_limit)
        else:
            documents = await self.repos.tenants.find_many(status=status, limit=effective_limit)
        items = [
            ListTenantsResponseTenantsItem.model_validate(document.model_dump())
            for document in documents
        ]
        return ListTenantsResponse(tenants=items)

    async def get_tenant(self, *, tenant_id: str) -> GetTenantResponse:
        """Read by id; invalid ids and absent tenants have distinct contract errors."""
        if re.fullmatch(OBJECT_ID_PATTERN, tenant_id) is None:
            raise InvalidId(details={"tenant_id": tenant_id})
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return GetTenantResponse.model_validate({"tenant": document.model_dump()})

    async def update_tenant(
        self, *, body: UpdateTenantRequest, tenant_id: str
    ) -> UpdateTenantResponse:
        """Patch explicit mutable fields, then reread the updated tenant."""
        supplied = body.model_dump(exclude_unset=True)
        if "tenant_key" in supplied or "tenant_key" in body.model_fields_set:
            raise TenantKeyImmutable(details={"field": "tenant_key"})
        if re.fullmatch(OBJECT_ID_PATTERN, tenant_id) is None:
            raise ValidationError("Invalid tenant id.", details={"tenant_id": tenant_id})
        # The generated PATCH model permits null even for required stored strings.
        for field in ("name", "status"):
            if field in supplied and supplied[field] is None:
                raise ValidationError("Field cannot be null.", details={"field": field})
        changes = {
            field: value
            for field, value in supplied.items()
            if field in {"name", "deployment_model", "cloud", "status"}
        }
        changes["updated_at"] = datetime.now(UTC)
        matched = await self.repos.tenants.update_one_by_id(tenant_id, changes)
        if not matched:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return UpdateTenantResponse.model_validate({"tenant": document.model_dump()})
