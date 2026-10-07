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
          - response chunk_profiles[].parameters <- pattern.parameters; absent -> null
          - response chunk_profiles[].tenant_id <- transform str(pattern.tenant_id) when nonnull; missing/null -> null
          - rule: tenantId is not a 24-hex ObjectId string. -> raise INVALID_ID
          - note: Await repos.chunk_profiles.run_qp_3(tenant_id=tenantId). QP returns only active profiles in tenant/global (tenant_id null or missing) scope. Do not add a tenant-existence check or a new 404.
          - note: Implicit _id is returned; convert it and nonnull tenant_id with str. Empty result -> chunk_profiles=[]. Exclude is_active and created_at from response; do not write.
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
          - response chunk_profile.parameters <- doc.parameters; absent -> null
          - response chunk_profile.is_active <- doc.is_active
          - response chunk_profile.created_at <- doc.created_at
          - rule: Missing required fields or invalid enum/ID values are validation failures. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None before insertion. -> raise TENANT_NOT_FOUND
          - note: Construct generated ChunkProfilesDocument from body name, strategy, parameters, is_active and tenant_id=path.tenantId, with generated ID/default mechanism and aware UTC created_at. Await repos.chunk_profiles.insert_one; return constructed record.
          - note: This endpoint creates tenant-specific profiles only. No actual chunking, activation of other records or uniqueness rule is declared.
        """
        raise NotImplementedOperation()
