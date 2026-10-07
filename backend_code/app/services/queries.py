"""Business logic for the `queries` resource.

Generated stub: method SIGNATURES are frozen (checked by G8). Implement method bodies and
add private helpers (names starting with "_") only."""

from __future__ import annotations

from datetime import datetime

from app.api.schemas import (
    CreateQueryRequest,
    CreateQueryResponse,
    ListBenchmarkQueriesResponse,
    ListRecentAdHocQueriesResponse,
)
from app.db.repositories import Repositories
from app.errors import (
    NotImplementedOperation,
)


class QueriesService:
    """Operations: createQuery, listRecentAdHocQueries, listBenchmarkQueries."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_query(
        self, *, body: CreateQueryRequest, tenant_id: str
    ) -> CreateQueryResponse:
        """createQuery - POST /api/v1/tenants/{tenantId}/queries -> 201

        Purpose: Create an ad hoc or benchmark query record before or alongside retrieval execution.

        Backing: queries.insertOne filter=null
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Missing required fields, invalid enum values, or invalid scope shape.
          - TenantNotFound (404 TENANT_NOT_FOUND): tenantId does not exist.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): benchmark_run_id is provided but does not exist for the tenant.
        Note: Backing (as written in the contract): CRUD insertOne on queries
        Binding plan:
          - prerequisite: Await repos.tenants.find_one_by_id(path.tenantId), None -> TENANT_NOT_FOUND. If body.benchmark_run_id supplied, await repos.benchmark_runs.find_one_by_id(value); None or tenant_id mismatch -> BENCHMARK_RUN_NOT_FOUND.
          - response query <- transform inserted document: _id, tenant_id, benchmark_run_id, query_text, query_type, expected_answer_text, ground_truth_chunk_ids, ground_truth_document_ids, document_scope, created_by, created_at from doc.same_named_field; absent nullable benchmark_run_id/expected_answer_text/document_scope/created_by -> null; optional arrays follow generated defaults/omission; all ObjectIds including nested scope references remain hex strings
          - rule: Missing required fields, invalid enum values, invalid identifier formats or scope shape. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None. -> raise TENANT_NOT_FOUND
          - rule: Supplied benchmark_run_id lookup returns None or its tenant_id differs from tenantId. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.queries.insert_one using only body fields, tenant_id=tenantId, generated _id and UTC created_at; return constructed document.
          - note: Do not execute retrieval, generate expected answers or embeddings, or verify ground-truth/document-scope referenced records absent a declared rule. Do not require benchmark_run_id merely because query_type=benchmark.
          - note: Optional non-nullable arrays follow generated model defaults/omission, not invented writes; nested ObjectId lists are converted by document models/repositories.
        """
        raise NotImplementedOperation()

    async def list_recent_ad_hoc_queries(
        self, *, tenant_id: str, created_after: datetime | None = None, limit: int | None = None
    ) -> ListRecentAdHocQueriesResponse:
        """listRecentAdHocQueries - GET /api/v1/tenants/{tenantId}/queries/history -> 200

        Purpose: Show recent ad hoc query history for a tenant demo session.

        Backing: query pattern QP-13 -> repos.<collection>.run_qp_13(...)
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Invalid tenant id or query parameters.
        Note: Backing (as written in the contract): QP-13
        Binding plan:
          - placeholder QP-13 <tenantId> <- path.tenantId
          - placeholder QP-13 <optionalStartDate> <- query.created_after
          - placeholder QP-13 <pageSize> <- query.limit
          - response queries[]._id <- transform str(pattern._id)
          - response queries[].query_text <- pattern.query_text
          - response queries[].document_scope <- transform pattern.document_scope with any nested ObjectId document_ids stringified; absent -> null
          - response queries[].created_by <- transform pattern.created_by; absent -> null
          - response queries[].created_at <- pattern.created_at
          - rule: Invalid tenant identifier or query parameter values. -> raise VALIDATION_ERROR
          - note: Await repos.queries.run_qp_13(tenant_id=tenantId,start_date=created_after,page_size=limit); absent start_date omitted by generated wrapper, absent limit uses generated default.
          - note: No tenant-existence error/read is declared. Empty history returns queries=[]. Preserve generated pattern ordering; no invented sorting. _id is implicit in find projection.
          - note: Convert nested document_scope.document_ids to hex strings if BSON identifiers remain in pattern rows; do not expose fields outside response.
        """
        raise NotImplementedOperation()

    async def list_benchmark_queries(
        self, *, tenant_id: str, benchmark_run_id: str
    ) -> ListBenchmarkQueriesResponse:
        """listBenchmarkQueries - GET /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId}/queries -> 200

        Purpose: List the benchmark question set and ground truth for a benchmark run.

        Backing: query pattern QP-9 -> repos.<collection>.run_qp_9(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): tenantId or benchmarkRunId is invalid.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): Run does not exist for tenant.
        Note: Backing (as written in the contract): QP-9
        Binding plan:
          - placeholder QP-9 <tenantId> <- path.tenantId
          - placeholder QP-9 <benchmarkRunId> <- path.benchmarkRunId
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response queries[]._id <- transform str(pattern._id)
          - response queries[].query_text <- pattern.query_text
          - response queries[].expected_answer_text <- transform pattern.expected_answer_text; absent -> null
          - response queries[].ground_truth_chunk_ids[] <- transform str(each pattern.ground_truth_chunk_ids element); absent array follows generated defaults/omission
          - response queries[].ground_truth_document_ids[] <- transform str(each pattern.ground_truth_document_ids element); absent array follows generated defaults/omission
          - response queries[].document_scope <- transform pattern.document_scope; stringify nested document_ids; absent -> null
          - response queries[].created_at <- pattern.created_at
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Benchmark run is missing or not owned by tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: After ownership prerequisite, await repos.queries.run_qp_9(tenant_id=tenantId,benchmark_run_id=benchmarkRunId). Empty question set for an existing run returns queries=[].
          - note: _id implicitly survives projection. Convert BSON ObjectId lists, including nested document_scope.document_ids; optional non-nullable arrays use generated response defaults/omission.
        """
        raise NotImplementedOperation()
