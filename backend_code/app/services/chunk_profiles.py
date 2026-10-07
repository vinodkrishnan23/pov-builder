"""Business logic for the `chunk_profiles` resource.

Generated stub: method SIGNATURES are frozen (checked by G8). Implement method bodies and
add private helpers (names starting with "_") only."""

from __future__ import annotations

from app.api.schemas import (
    CreateChunkProfileRequest,
    CreateChunkProfileResponse,
    ListChunkProfilesResponse,
)
from app.db.repositories import Repositories
from app.errors import NotImplementedOperation


class ChunkProfilesService:
    """Operations: listChunkProfiles, createChunkProfile."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def list_chunk_profiles(self, *, tenant_id: str) -> ListChunkProfilesResponse:
        """listChunkProfiles - GET /api/v1/tenants/{tenantId}/chunk-profiles -> 200

        Purpose: Retrieve active chunking strategies available for comparison in the POV.

        Backing: query pattern QP-3 -> repos.<collection>.run_qp_3(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): tenantId is invalid.
        Note: Backing (as written in the contract): QP-3
        Binding plan:
          - placeholder QP-3 <tenantId> <- path.tenantId
          - response chunk_profiles[]._id <- transform str(pattern._id)
          - response chunk_profiles[].name <- pattern.name
          - response chunk_profiles[].strategy <- pattern.strategy
          - response chunk_profiles[].parameters <- transform pattern.parameters; absent -> null
          - response chunk_profiles[].tenant_id <- transform str(pattern.tenant_id) when present/non-null; otherwise null
          - rule: tenantId is not a valid ObjectId string. -> raise INVALID_ID
          - note: Await repos.chunk_profiles.run_qp_3(tenant_id=tenantId). QP-3 includes active tenant-owned and global profiles; do not add tenant-existence validation or an active-tenant requirement.
          - note: Return [] when no profiles match. _id is implicitly included; tenant_id missing/null denotes a global profile. Exclude is_active/created_at.
        """
        raise NotImplementedOperation()

    async def create_chunk_profile(
        self, *, body: CreateChunkProfileRequest, tenant_id: str
    ) -> CreateChunkProfileResponse:
        """createChunkProfile - POST /api/v1/tenants/{tenantId}/chunk-profiles -> 201

        Purpose: Create a tenant-specific chunk profile for benchmark or demo comparisons.

        Backing: chunk_profiles.insertOne filter=null
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Missing required fields or invalid enum values.
          - TenantNotFound (404 TENANT_NOT_FOUND): tenantId does not exist.
        Note: Backing (as written in the contract): CRUD insertOne on chunk_profiles
        Binding plan:
          - prerequisite: Await repos.tenants.find_one_by_id(path.tenantId); None -> TENANT_NOT_FOUND.
          - response chunk_profile <- transform inserted document: _id, tenant_id, name, strategy, parameters, is_active, created_at from doc.same_named_field; absent parameters -> null
          - rule: Missing required fields, invalid identifier formats or enum values. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None. -> raise TENANT_NOT_FOUND
          - note: Await repos.chunk_profiles.insert_one using body name/strategy/parameters/is_active, tenant_id=tenantId and generated _id/UTC created_at; return the constructed stored document.
          - note: This creates a tenant-specific profile only; do not make a global profile or execute chunking.
        """
        raise NotImplementedOperation()
