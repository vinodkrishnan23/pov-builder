"""Business logic for the `benchmark_runs` resource.

Generated stub: method SIGNATURES are frozen (checked by G8). Implement method bodies and
add private helpers (names starting with "_") only."""

from __future__ import annotations

from typing import Literal

from app.api.schemas import (
    CreateBenchmarkRunRequest,
    CreateBenchmarkRunResponse,
    GetBenchmarkRunDetailResponse,
    ListBenchmarkRunsResponse,
    UpdateBenchmarkRunRequest,
    UpdateBenchmarkRunResponse,
)
from app.db.repositories import Repositories
from app.errors import (
    NotImplementedOperation,
)


class BenchmarkRunsService:
    """Operations: createBenchmarkRun, listBenchmarkRuns, getBenchmarkRunDetail, updateBenchmarkRun."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_benchmark_run(
        self, *, body: CreateBenchmarkRunRequest, tenant_id: str
    ) -> CreateBenchmarkRunResponse:
        """createBenchmarkRun - POST /api/v1/tenants/{tenantId}/benchmark-runs -> 201

        Purpose: Create a benchmark run configuration for side-by-side POV evaluation.

        Backing: benchmark_runs.insertOne filter=null
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Missing required fields or invalid enum values.
          - TenantNotFound (404 TENANT_NOT_FOUND): tenantId does not exist.
        Note: Backing (as written in the contract): CRUD insertOne on benchmark_runs
        Binding plan:
          - prerequisite: Await repos.tenants.find_one_by_id(path.tenantId); None -> TENANT_NOT_FOUND.
          - response benchmark_run._id <- doc._id
          - response benchmark_run.tenant_id <- doc.tenant_id
          - response benchmark_run.name <- doc.name
          - response benchmark_run.status <- doc.status
          - response benchmark_run.comparison_targets[].target_name <- doc.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- doc.comparison_targets[].target_type
          - response benchmark_run.chunk_profile_ids <- doc.chunk_profile_ids; absent -> []
          - response benchmark_run.top_k_values <- doc.top_k_values
          - response benchmark_run.notes <- doc.notes
          - response benchmark_run.started_at <- doc.started_at
          - response benchmark_run.completed_at <- doc.completed_at
          - response benchmark_run.created_at <- doc.created_at
          - rule: Missing required fields, invalid enum values or invalid declared ids not caught by routes. -> raise VALIDATION_ERROR
          - rule: Tenant prerequisite lookup returns None. -> raise TENANT_NOT_FOUND
          - note: Await repos.benchmark_runs.insert_one with BenchmarkRunsDocument from all declared body fields plus tenant_id=path.tenantId, generated id and UTC created_at. Return the inserted document.
          - note: status is supplied, not defaulted to draft. started_at/completed_at are supplied optional values; do not derive them from status. No date-order checks, transition rules, benchmark execution, comparison-system calls, profile existence checks, positive top-k constraints or uniqueness errors are declared.
          - note: Absent optional chunk_profile_ids -> [] in response; nullable notes/started_at/completed_at remain null.
        """
        raise NotImplementedOperation()

    async def list_benchmark_runs(
        self,
        *,
        tenant_id: str,
        status: Literal["draft", "running", "completed", "failed"] | None = None,
        limit: int | None = None,
    ) -> ListBenchmarkRunsResponse:
        """listBenchmarkRuns - GET /api/v1/tenants/{tenantId}/benchmark-runs -> 200

        Purpose: List benchmark runs for a tenant.

        Backing: query pattern QP-8 -> repos.<collection>.run_qp_8(...)
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Invalid tenant id or filter values.
        Note: Backing (as written in the contract): QP-8
        Binding plan:
          - placeholder QP-8 <tenantId> <- path.tenantId
          - placeholder QP-8 <pageSize> <- query.limit
          - response benchmark_runs[]._id <- str(pattern._id)
          - response benchmark_runs[].name <- pattern.name
          - response benchmark_runs[].status <- pattern.status
          - response benchmark_runs[].comparison_targets[].target_name <- pattern.comparison_targets[].target_name
          - response benchmark_runs[].comparison_targets[].target_type <- pattern.comparison_targets[].target_type
          - response benchmark_runs[].chunk_profile_ids <- stringify each pattern.chunk_profile_ids element; absent -> []
          - response benchmark_runs[].top_k_values <- pattern.top_k_values
          - response benchmark_runs[].started_at <- pattern.started_at; absent -> null
          - response benchmark_runs[].completed_at <- pattern.completed_at; absent -> null
          - response benchmark_runs[].created_at <- pattern.created_at
          - rule: Invalid tenant id or filter values, including status outside the declared benchmark status enum. -> raise VALIDATION_ERROR
          - note: Await repos.benchmark_runs.run_qp_8(tenant_id=path.tenantId, page_size=effective limit). Use frozen/generated limit default when omitted.
          - note: status query parameter has no placeholder in QP-8; preserve its fixed enum $in and apply supplied status equality to returned rows in memory. Do not build a custom MongoDB filter. This may return fewer than limit because QP-8 page size precedes service filtering; no refill or invented pagination.
          - note: No tenant prerequisite/error declared. Empty list is success. Projected _id is retained implicitly; stringify it and chunk_profile_ids. Exclude tenant_id/notes because this response does not include them.
        """
        raise NotImplementedOperation()

    async def get_benchmark_run_detail(
        self, *, tenant_id: str, benchmark_run_id: str
    ) -> GetBenchmarkRunDetailResponse:
        """getBenchmarkRunDetail - GET /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId} -> 200

        Purpose: Retrieve benchmark configuration details including chunk profile definitions.

        Backing: query pattern QP-14 -> repos.<collection>.run_qp_14(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): tenantId or benchmarkRunId is invalid.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): Run does not exist for tenant.
        Note: Backing (as written in the contract): QP-14
        Binding plan:
          - placeholder QP-14 <benchmarkRunId> <- path.benchmarkRunId
          - placeholder QP-14 <tenantId> <- path.tenantId
          - response benchmark_run._id <- str(pattern._id)
          - response benchmark_run.name <- pattern.name
          - response benchmark_run.status <- pattern.status
          - response benchmark_run.comparison_targets[].target_name <- pattern.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- pattern.comparison_targets[].target_type
          - response benchmark_run.top_k_values <- pattern.top_k_values
          - response benchmark_run.notes <- pattern.notes; absent -> null
          - response benchmark_run.started_at <- pattern.started_at; absent -> null
          - response benchmark_run.completed_at <- pattern.completed_at; absent -> null
          - response benchmark_run.chunk_profiles[]._id <- str(pattern.chunk_profiles[]._id)
          - response benchmark_run.chunk_profiles[].name <- pattern.chunk_profiles[].name
          - response benchmark_run.chunk_profiles[].strategy <- pattern.chunk_profiles[].strategy
          - response benchmark_run.chunk_profiles[].parameters <- pattern.chunk_profiles[].parameters; absent -> null
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: QP-14 returns no row for the tenant/run pair. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.benchmark_runs.run_qp_14(benchmark_run_id=path.benchmarkRunId, tenant_id=path.tenantId); map the first row to benchmark_run. The _id/tenant match guarantees at most one run.
          - note: Retain profile lookup/projection verbatim; stringify projected run/profile ids. No extra profile scoping or active filtering. Missing profile references yield an empty or partial lookup array, not a profile-not-found error.
          - note: Exclude tenant_id/chunk_profile_ids/created_at from response since absent in the declared shape. Nullable notes/times/parameters remain null; absent optional arrays use [] as appropriate.
        """
        raise NotImplementedOperation()

    async def update_benchmark_run(
        self, *, body: UpdateBenchmarkRunRequest, tenant_id: str, benchmark_run_id: str
    ) -> UpdateBenchmarkRunResponse:
        """updateBenchmarkRun - PATCH /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId} -> 200

        Purpose: Update benchmark run status or configuration fields.

        Backing: benchmark_runs.updateOne filter={"_id": "{benchmarkRunId}", "tenant_id": "{tenantId}"}
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Invalid fields or enum values.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): Run does not exist for tenant.
        Note: Backing (as written in the contract): CRUD updateOne on benchmark_runs
        Binding plan:
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND before write.
          - response benchmark_run._id <- doc._id
          - response benchmark_run.tenant_id <- doc.tenant_id
          - response benchmark_run.name <- doc.name
          - response benchmark_run.status <- doc.status
          - response benchmark_run.comparison_targets[].target_name <- doc.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- doc.comparison_targets[].target_type
          - response benchmark_run.chunk_profile_ids <- doc.chunk_profile_ids; absent -> []
          - response benchmark_run.top_k_values <- doc.top_k_values
          - response benchmark_run.notes <- doc.notes
          - response benchmark_run.started_at <- doc.started_at
          - response benchmark_run.completed_at <- doc.completed_at
          - response benchmark_run.created_at <- doc.created_at
          - rule: Invalid fields, enums or declared ids not caught by routes. -> raise VALIDATION_ERROR
          - rule: Ownership read fails, update reports no match, or response reread is absent or owned by another tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: After ownership prerequisite, await repos.benchmark_runs.update_one_by_id(path.benchmarkRunId, changes) with only explicitly supplied name/status/comparison_targets/chunk_profile_ids/top_k_values/notes/started_at/completed_at. Use exclude_unset=True.
          - note: Do not add updated_at: benchmark_runs does not declare that field. Preserve id/tenant_id/created_at. Do not derive timestamps, impose transition/date-order rules, run benchmarks or validate profile existence.
          - note: Use a generated scoped update if available; otherwise id-only update follows the prerequisite because tenant_id cannot change through these APIs. Reread via find_one_by_id, recheck tenant and return stored values; boolean update result is not response data.
        """
        raise NotImplementedOperation()
