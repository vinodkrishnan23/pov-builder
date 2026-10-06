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
          - response chunk_profiles[]._id <- str(pattern._id)
          - response chunk_profiles[].name <- pattern.name
          - response chunk_profiles[].strategy <- pattern.strategy
          - response chunk_profiles[].parameters <- pattern.parameters; absent -> null
          - response chunk_profiles[].tenant_id <- str(pattern.tenant_id) when present/non-null; otherwise null
          - rule: tenantId is not a valid ObjectId string. -> raise INVALID_ID
          - note: Await repos.chunk_profiles.run_qp_3(tenant_id=path.tenantId). Keep the fixed is_active=true and tenant-or-global predicate verbatim.
          - note: No tenant existence error is declared; no tenant prerequisite. Empty list is success. Omit is_active/created_at from response. Implicit projection _id and nullable tenant_id BSON values require string conversion when nonnull.
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
          - response chunk_profile._id <- doc._id
          - response chunk_profile.tenant_id <- doc.tenant_id
          - response chunk_profile.name <- doc.name
          - response chunk_profile.strategy <- doc.strategy
          - response chunk_profile.parameters <- doc.parameters
          - response chunk_profile.is_active <- doc.is_active
          - response chunk_profile.created_at <- doc.created_at
          - rule: Missing required fields, invalid enum values or invalid tenant id not caught by routes. -> raise VALIDATION_ERROR
          - rule: Tenant prerequisite lookup returns None. -> raise TENANT_NOT_FOUND
          - note: Build ChunkProfilesDocument from body.name/strategy/parameters/is_active, tenant_id=path.tenantId, generated id and UTC created_at. Await repos.chunk_profiles.insert_one and return that document.
          - note: This creates tenant-specific profiles only, never a global profile. No chunking execution, validation of arbitrary parameter keys, uniqueness conflict or active-state restriction is declared.
        """
        raise NotImplementedOperation()
