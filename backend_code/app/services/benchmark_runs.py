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
          - response benchmark_run <- transform inserted document: _id, tenant_id, name, status, comparison_targets, chunk_profile_ids, top_k_values, notes, started_at, completed_at, created_at from doc.same_named_field; absent notes/started_at/completed_at -> null; chunk_profile_ids hex strings with generated defaults/omission
          - response benchmark_run.comparison_targets[].target_name <- doc.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- doc.comparison_targets[].target_type
          - rule: Missing required fields, invalid identifier formats or enum values. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None. -> raise TENANT_NOT_FOUND
          - note: Await repos.benchmark_runs.insert_one with declared body fields, tenant_id=tenantId and generated _id/UTC created_at. Return constructed stored document.
          - note: Do not start a benchmark, contact comparison targets, validate referenced chunk profiles, or derive started_at/completed_at from status. Persist supplied values only. No date-order check, state machine, positive-k check or nonempty-array rule is declared.
          - note: Optional non-nullable chunk_profile_ids follows generated model defaults/omission.
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
          - response benchmark_runs[]._id <- transform str(pattern._id)
          - response benchmark_runs[].name <- pattern.name
          - response benchmark_runs[].status <- pattern.status
          - response benchmark_runs[].comparison_targets[].target_name <- pattern.comparison_targets[].target_name
          - response benchmark_runs[].comparison_targets[].target_type <- pattern.comparison_targets[].target_type
          - response benchmark_runs[].chunk_profile_ids[] <- transform str(each pattern.chunk_profile_ids element); absent array follows generated defaults/omission
          - response benchmark_runs[].top_k_values <- pattern.top_k_values
          - response benchmark_runs[].started_at <- transform pattern.started_at; absent -> null
          - response benchmark_runs[].completed_at <- transform pattern.completed_at; absent -> null
          - response benchmark_runs[].created_at <- pattern.created_at
          - rule: Invalid tenant identifier, parameter types or status enum values. -> raise VALIDATION_ERROR
          - note: Await repos.benchmark_runs.run_qp_8(tenant_id=tenantId,page_size=limit), retaining generated default for absent limit.
          - note: QP-8 has a fixed all-status $in and no status placeholder. Honor supplied status via equality post-filter on returned rows, without changing QP-8; this filters an already limited page and can underfill. Do not switch to CRUD or fabricate a new pattern. Filtering-before-limit requirements would require a contract/repository correction.
          - note: No tenant-existence read is declared. Empty rows return benchmark_runs=[]. Convert implicit _id and chunk_profile_ids to hex strings; exclude tenant_id/notes.
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
          - response benchmark_run._id <- transform str(pattern._id) from the single QP-14 row
          - response benchmark_run.name <- pattern.name
          - response benchmark_run.status <- pattern.status
          - response benchmark_run.comparison_targets[].target_name <- pattern.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- pattern.comparison_targets[].target_type
          - response benchmark_run.top_k_values <- pattern.top_k_values
          - response benchmark_run.notes <- transform pattern.notes; absent -> null
          - response benchmark_run.started_at <- transform pattern.started_at; absent -> null
          - response benchmark_run.completed_at <- transform pattern.completed_at; absent -> null
          - response benchmark_run.chunk_profiles[]._id <- transform str(pattern.chunk_profiles[]._id), provided QP-14 returns the declared joined-profile array
          - response benchmark_run.chunk_profiles[].name <- pattern.chunk_profiles[].name
          - response benchmark_run.chunk_profiles[].strategy <- pattern.chunk_profiles[].strategy
          - response benchmark_run.chunk_profiles[].parameters <- transform pattern.chunk_profiles[].parameters; absent -> null
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: QP-14 returns no matching run row. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.benchmark_runs.run_qp_14(benchmark_run_id=benchmarkRunId,tenant_id=tenantId); take its one matching row. _id is implicitly preserved.
          - note: Map chunk_profiles according to the actual authoritative projection; no profile match should yield an empty array. Do not fetch missing profiles or introduce an active/global ownership filter.
          - note: QP-14 expresses chunk_profiles projection as nested inclusion flags rather than the dotted inclusion used elsewhere. Use the generated pipeline verbatim; if actual MongoDB output is a flag document instead of the declared profile array, that is an unresolvable contract/pipeline mismatch, not permission to rewrite the pipeline or fabricate profiles.
          - note: Exclude tenant_id/chunk_profile_ids/created_at because they are not response fields.
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
          - response benchmark_run <- transform post-update CRUD document: _id, tenant_id, name, status, comparison_targets, chunk_profile_ids, top_k_values, notes, started_at, completed_at, created_at from doc.same_named_field; absent nullable fields -> null; chunk_profile_ids hex strings with generated omission/defaults
          - response benchmark_run.comparison_targets[].target_name <- doc.comparison_targets[].target_name
          - response benchmark_run.comparison_targets[].target_type <- doc.comparison_targets[].target_type
          - rule: Invalid fields, identifier formats or enum values not already rejected by routes. -> raise VALIDATION_ERROR
          - rule: Run lookup is None or tenant_id differs, update reports no match, or post-update read is missing/not tenant-owned. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.benchmark_runs.find_one_by_id(benchmarkRunId) and verify tenant_id, then await update_one_by_id with explicitly provided declared patch fields only; return post-update lookup. Prefer generated tenant-scoped wrapper when present, never build a filter.
          - note: Preserve _id/tenant_id/created_at. No updated_at field exists on benchmark_runs: do not add one. Do not impose status transitions, synthesize start/completion timestamps, execute comparisons, or require referenced profile existence.
          - note: Use exclude_unset; no declared empty-patch or date-order rejection.
        """
        raise NotImplementedOperation()
