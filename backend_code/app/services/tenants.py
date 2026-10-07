"""Business logic for the tenants resource."""

from __future__ import annotations

from secrets import token_hex
from typing import Literal

from app.api.schemas import (
    CreateTenantRequest,
    CreateTenantResponse,
    CreateTenantResponseTenant,
    GetTenantResponse,
    GetTenantResponseTenant,
    ListTenantsResponse,
    ListTenantsResponseTenantsItem,
    UpdateTenantRequest,
    UpdateTenantResponse,
    UpdateTenantResponseTenant,
)
from app.db.repositories import Repositories
from app.errors import DuplicateKeyConflict, TenantKeyConflict, TenantKeyImmutable, TenantNotFound
from app.models.documents import TenantsDocument
from app.types import utc_now


class TenantsService:
    """Operations: createTenant, listTenants, getTenant, updateTenant."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_tenant(self, *, body: CreateTenantRequest) -> CreateTenantResponse:
        """Insert a tenant; translate unique tenant-key conflicts to TenantKeyConflict."""
        now = utc_now()
        data = body.model_dump()
        # The generated document has no identifier or timestamp factories, and
        # insert_one returns None, so allocate the API hex identifier before insertion.
        data.update(id=token_hex(12), created_at=now, updated_at=now)
        document = TenantsDocument.model_validate(data)
        try:
            await self.repos.tenants.insert_one(document)
        except DuplicateKeyConflict as error:
            raise TenantKeyConflict(details={"tenant_key": body.tenant_key}) from error
        return CreateTenantResponse(
            tenant=CreateTenantResponseTenant.model_validate(document.model_dump())
        )

    async def list_tenants(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int | None = None
    ) -> ListTenantsResponse:
        """List tenants using the optional status and the repository's default limit."""
        if limit is None:
            documents = await self.repos.tenants.find_many(status=status)
        else:
            documents = await self.repos.tenants.find_many(status=status, limit=limit)
        return ListTenantsResponse(
            tenants=[
                ListTenantsResponseTenantsItem.model_validate(document.model_dump())
                for document in documents
            ]
        )

    async def get_tenant(self, *, tenant_id: str) -> GetTenantResponse:
        """Read a tenant; the route validates ObjectId syntax before this call."""
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return GetTenantResponse(
            tenant=GetTenantResponseTenant.model_validate(document.model_dump())
        )

    async def update_tenant(
        self, *, body: UpdateTenantRequest, tenant_id: str
    ) -> UpdateTenantResponse:
        """Patch explicit mutable fields and reread; raise TenantNotFound on any miss."""
        if "tenant_key" in body.model_fields_set or "tenant_key" in (body.model_extra or {}):
            raise TenantKeyImmutable(details={"field": "tenant_key"})
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        changes = body.model_dump(
            exclude_unset=True, include={"name", "deployment_model", "cloud", "status"}
        )
        changes["updated_at"] = utc_now()
        matched = await self.repos.tenants.update_one_by_id(tenant_id, changes)
        if not matched:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        updated = await self.repos.tenants.find_one_by_id(tenant_id)
        if updated is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return UpdateTenantResponse(
            tenant=UpdateTenantResponseTenant.model_validate(updated.model_dump())
        )
