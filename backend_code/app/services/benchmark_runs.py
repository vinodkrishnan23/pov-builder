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
          - response benchmark_run.comparison_targets <- doc.comparison_targets; copy target_name and target_type for each item
          - response benchmark_run.chunk_profile_ids <- doc.chunk_profile_ids; generated omission/default when absent
          - response benchmark_run.top_k_values <- doc.top_k_values
          - response benchmark_run.notes <- doc.notes; absent -> null
          - response benchmark_run.started_at <- doc.started_at; absent -> null
          - response benchmark_run.completed_at <- doc.completed_at; absent -> null
          - response benchmark_run.created_at <- doc.created_at
          - rule: Missing required fields or invalid enum/ID/type values are validation failures. No nonempty arrays, positive top_k_values or timestamp ordering constraints are declared. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None before insertion. -> raise TENANT_NOT_FOUND
          - note: Construct BenchmarkRunsDocument from body and tenant_id=tenantId using generated ID/default mechanism and aware UTC created_at; await repos.benchmark_runs.insert_one and return the constructed document.
          - note: Persist configuration/status/timestamps exactly as supplied. Do not start a run, execute comparisons, derive started_at/completed_at from status or validate undeclared transition/date ordering rules. No profile-reference existence check is declared.
          - note: Missing optional chunk_profile_ids uses generated omission/default behavior. Nested comparison_targets copies target_name/target_type without changes.
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
          - response benchmark_runs[].comparison_targets <- pattern.comparison_targets; copy target_name and target_type
          - response benchmark_runs[].chunk_profile_ids <- transform stringify each pattern.chunk_profile_ids[]; generated default/omission if absent
          - response benchmark_runs[].top_k_values <- pattern.top_k_values
          - response benchmark_runs[].started_at <- pattern.started_at; absent -> null
          - response benchmark_runs[].completed_at <- pattern.completed_at; absent -> null
          - response benchmark_runs[].created_at <- pattern.created_at
          - rule: Invalid tenant ID or status/limit parameter values are validation failures; no undeclared limit bounds. -> raise VALIDATION_ERROR
          - note: Await repos.benchmark_runs.run_qp_8(tenant_id=tenantId,page_size=limit); omitted limit uses frozen signature/generated repository default.
          - note: QP-8 has no status placeholder and fixes all four statuses. If query.status is supplied, restrict returned rows by status in memory, without altering the pattern. This may return fewer than limit and does not guarantee pre-page filtering; flag clarification if pre-limit status filtering is required. Do not ignore the supplied filter or issue a replacement query.
          - note: No tenant-existence error is declared; [] succeeds. Convert implicit _id and chunk_profile_ids[] ObjectIds to strings. Exclude notes/tenant_id; no writes.
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
          - response benchmark_run._id <- transform str(pattern._id)
          - response benchmark_run.name <- pattern.name
          - response benchmark_run.status <- pattern.status
          - response benchmark_run.comparison_targets <- pattern.comparison_targets; copy target_name and target_type
          - response benchmark_run.top_k_values <- pattern.top_k_values
          - response benchmark_run.notes <- pattern.notes; absent -> null
          - response benchmark_run.started_at <- pattern.started_at; absent -> null
          - response benchmark_run.completed_at <- pattern.completed_at; absent -> null
          - response benchmark_run.chunk_profiles[]._id <- transform str(pattern.chunk_profiles[]._id)
          - response benchmark_run.chunk_profiles[].name <- pattern.chunk_profiles[].name
          - response benchmark_run.chunk_profiles[].strategy <- pattern.chunk_profiles[].strategy
          - response benchmark_run.chunk_profiles[].parameters <- pattern.chunk_profiles[].parameters; absent -> null
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: QP-14 returns no matching benchmark-run row. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.benchmark_runs.run_qp_14(benchmark_run_id=benchmarkRunId,tenant_id=tenantId). Use the single matching row for benchmark_run. QP already scopes by tenant; no additional read required.
          - note: Convert implicit top-level _id and nested chunk_profiles[]._id with str. Lookup returns chunk_profiles=[] when there are no matches. Do not synthesize missing referenced profiles, filter profiles beyond the pattern, or include created_at/tenant_id/chunk_profile_ids in response.
          - note: Retain the supplied projection verbatim. If generated MongoDB output for the nested chunk_profiles projection does not produce the declared definitions, flag query-pattern/schema mismatch rather than replace it with another pipeline. No writes.
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
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND before writing.
          - response benchmark_run._id <- doc._id of updated record
          - response benchmark_run.tenant_id <- doc.tenant_id
          - response benchmark_run.name <- doc.name
          - response benchmark_run.status <- doc.status
          - response benchmark_run.comparison_targets <- doc.comparison_targets; copy target_name and target_type
          - response benchmark_run.chunk_profile_ids <- doc.chunk_profile_ids; generated omission/default if absent
          - response benchmark_run.top_k_values <- doc.top_k_values
          - response benchmark_run.notes <- doc.notes; absent -> null
          - response benchmark_run.started_at <- doc.started_at; absent -> null
          - response benchmark_run.completed_at <- doc.completed_at; absent -> null
          - response benchmark_run.created_at <- doc.created_at
          - rule: Invalid fields, enum values or IDs use this operation's validation error. -> raise VALIDATION_ERROR
          - rule: Pre-read absent/wrong tenant, update matches no record, or readback absent/wrong tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.benchmark_runs.update_one_by_id(benchmarkRunId, changes) after ownership read; prefer generated scoped update if available. changes consist only of explicitly supplied name, status, comparison_targets, chunk_profile_ids, top_k_values, notes, started_at, completed_at. Read back the updated document.
          - note: Preserve tenant_id/_id/created_at. There is no updated_at field in benchmark_runs: do not write it. No execution, status transitions, automatic timestamps, profile existence checks or cross-field date constraints are declared. Empty PATCH is not declared invalid.
          - note: If the generated update lacks an atomic tenant-scoped variant, retain the pre-read ownership guard and flag any atomic-scope requirement as a generator gap; never bypass repository methods.
        """
        raise NotImplementedOperation()
