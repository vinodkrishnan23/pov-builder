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
          - prerequisite: Await repos.tenants.find_one_by_id(path.tenantId); None -> TENANT_NOT_FOUND. If body.benchmark_run_id is supplied, await repos.benchmark_runs.find_one_by_id(value); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response query._id <- doc._id
          - response query.tenant_id <- doc.tenant_id
          - response query.benchmark_run_id <- doc.benchmark_run_id; absent -> null
          - response query.query_text <- doc.query_text
          - response query.query_type <- doc.query_type
          - response query.expected_answer_text <- doc.expected_answer_text; absent -> null
          - response query.ground_truth_chunk_ids <- doc.ground_truth_chunk_ids; generated default/omission if absent
          - response query.ground_truth_document_ids <- doc.ground_truth_document_ids; generated default/omission if absent
          - response query.document_scope <- doc.document_scope; absent -> null; preserve document_ids, source_systems and metadata_filters
          - response query.created_by <- doc.created_by; absent -> null
          - response query.created_at <- doc.created_at
          - rule: Missing required fields, invalid enum/ID values or invalid scope shape are validation failures. -> raise VALIDATION_ERROR
          - rule: Tenant lookup returns None. -> raise TENANT_NOT_FOUND
          - rule: Provided benchmark_run_id is absent or does not belong to tenantId. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Construct QueriesDocument from declared body, tenant_id=tenantId, generated ID/default mechanism and aware UTC created_at; await repos.queries.insert_one and return constructed document.
          - note: Only check the explicitly declared tenant/run references. Do not add existence checks for ground-truth IDs, scoped documents or users. Do not require benchmark_run_id whenever query_type=benchmark; no such cross-field rule is declared.
          - note: No retrieval, embedding generation, scoring, benchmark execution or side-effect writes. Optional ground-truth arrays use generated omission/default semantics; nested document_scope ID arrays remain API hex strings.
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
          - response queries[].document_scope <- transform pattern.document_scope with document_ids[] stringified; absent -> null; preserve all other stored scope values
          - response queries[].created_by <- pattern.created_by; absent -> null
          - response queries[].created_at <- pattern.created_at
          - rule: Invalid tenant ID or query parameter types/date values are validation failures. -> raise VALIDATION_ERROR
          - note: Await repos.queries.run_qp_13(tenant_id=tenantId,start_date=created_after,page_size=limit). None date delegates omission; omitted limit uses generated defaults. Preserve pattern ordering; no invented sort or paging.
          - note: Implicit _id and nested document_scope.document_ids may be BSON ObjectIds: stringify ID values when building the response. No tenant-existence error is declared. Empty queries list succeeds; no writes.
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
          - response queries[].expected_answer_text <- pattern.expected_answer_text; absent -> null
          - response queries[].ground_truth_chunk_ids <- transform stringify each pattern.ground_truth_chunk_ids[]; honor generated defaults/omission if absent
          - response queries[].ground_truth_document_ids <- transform stringify each pattern.ground_truth_document_ids[]; honor generated defaults/omission if absent
          - response queries[].document_scope <- transform pattern.document_scope with document_ids[] stringified; absent -> null
          - response queries[].created_at <- pattern.created_at
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run lookup returns None or belongs to another tenant, independently of an empty query result. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.queries.run_qp_9(tenant_id=tenantId,benchmark_run_id=benchmarkRunId) after run ownership check. No per-query existence requirement; existing run with no benchmark queries returns [].
          - note: Implicit _id, ground-truth ID arrays and scope.document_ids[] must be stringified. Missing nullable values -> null; absent nonnullable optional arrays follow generated defaults/omission. No writes.
        """
        raise NotImplementedOperation()
