"""Business logic for the tenants resource."""

from __future__ import annotations

from datetime import UTC, datetime
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
from app.errors import (
    DuplicateKeyConflict,
    TenantKeyConflict,
    TenantKeyImmutable,
    TenantNotFound,
    ValidationError,
)
from app.models.documents import TenantsDocument


class TenantsService:
    """Operations: createTenant, listTenants, getTenant, updateTenant."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_tenant(self, *, body: CreateTenantRequest) -> CreateTenantResponse:
        """Insert a tenant; translate duplicate keys to TENANT_KEY_CONFLICT."""
        now = datetime.now(UTC)
        data = body.model_dump()
        # The generated model defaults id to None and insert_one returns no ID.
        data.update(id=token_hex(12), created_at=now, updated_at=now)
        document = TenantsDocument.model_validate(data)
        try:
            await self.repos.tenants.insert_one(document)
        except DuplicateKeyConflict as error:
            raise TenantKeyConflict(
                "A tenant with this tenant_key already exists.",
                details={"tenant_key": body.tenant_key},
            ) from error
        return CreateTenantResponse(
            tenant=CreateTenantResponseTenant.model_validate(document.model_dump())
        )

    async def list_tenants(
        self, *, status: Literal["active", "inactive"] | None = None, limit: int | None = None
    ) -> ListTenantsResponse:
        """Read tenants with the repository's default limit when omitted."""
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
        """Read one tenant; the generated route validates the ObjectId."""
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return GetTenantResponse(
            tenant=GetTenantResponseTenant.model_validate(document.model_dump())
        )

    async def update_tenant(
        self, *, body: UpdateTenantRequest, tenant_id: str
    ) -> UpdateTenantResponse:
        """Update explicit mutable fields and read back the persisted tenant."""
        if "tenant_key" in body.model_fields_set or (
            body.model_extra is not None and "tenant_key" in body.model_extra
        ):
            raise TenantKeyImmutable(details={"field": "tenant_key"})
        # Normal request validation discards tenant_key (extra="ignore"), so
        # the immutable-key error is unreachable for ordinary route requests.
        changes = body.model_dump(
            exclude_unset=True, include={"name", "deployment_model", "cloud", "status"}
        )
        for field in ("name", "status"):
            if field in changes and changes[field] is None:
                raise ValidationError(f"{field} cannot be null.", details={"field": field})
        existing = await self.repos.tenants.find_one_by_id(tenant_id)
        if existing is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        changes["updated_at"] = datetime.now(UTC)
        matched = await self.repos.tenants.update_one_by_id(tenant_id, changes)
        if not matched:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        document = await self.repos.tenants.find_one_by_id(tenant_id)
        if document is None:
            raise TenantNotFound(details={"tenant_id": tenant_id})
        return UpdateTenantResponse(
            tenant=UpdateTenantResponseTenant.model_validate(document.model_dump())
        )
