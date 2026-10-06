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
          - prerequisite: Await repos.tenants.find_one_by_id(path.tenantId); None -> TENANT_NOT_FOUND. If body.benchmark_run_id is provided, await repos.benchmark_runs.find_one_by_id(body.benchmark_run_id); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response query._id <- doc._id
          - response query.tenant_id <- doc.tenant_id
          - response query.benchmark_run_id <- doc.benchmark_run_id
          - response query.query_text <- doc.query_text
          - response query.query_type <- doc.query_type
          - response query.expected_answer_text <- doc.expected_answer_text
          - response query.ground_truth_chunk_ids <- doc.ground_truth_chunk_ids; absent -> []
          - response query.ground_truth_document_ids <- doc.ground_truth_document_ids; absent -> []
          - response query.document_scope <- doc.document_scope, including declared document_ids/source_systems/metadata_filters only
          - response query.created_by <- doc.created_by
          - response query.created_at <- doc.created_at
          - rule: Missing required fields, invalid enums, invalid declared ids or invalid document_scope shape. -> raise VALIDATION_ERROR
          - rule: Tenant prerequisite lookup returns None. -> raise TENANT_NOT_FOUND
          - rule: Provided benchmark_run_id lookup is missing or not owned by the path tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.queries.insert_one with QueriesDocument populated from declared body fields, tenant_id=path.tenantId, generated id and UTC created_at. Return inserted document.
          - note: Persist ground truth and scope as supplied. Do not require a run merely because query_type=benchmark, validate existence of ground truth ids, generate embeddings, run search, compute metrics or create results; none is declared.
          - note: Absent optional ground_truth arrays map to [] for nonnullable response arrays; nullable optional scalar/object fields remain null. Nested document_scope document_ids remain hex strings.
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
          - response queries[]._id <- str(pattern._id)
          - response queries[].query_text <- pattern.query_text
          - response queries[].document_scope <- pattern.document_scope; absent -> null; stringify nested document_ids without changing scope data
          - response queries[].created_by <- pattern.created_by; absent -> null
          - response queries[].created_at <- pattern.created_at
          - rule: Invalid tenant id or query parameters. -> raise VALIDATION_ERROR
          - note: Await repos.queries.run_qp_13(tenant_id=tenantId, start_date=created_after, page_size=effective limit). Absent start_date -> None for wrapper omission; limit uses frozen/generated default.
          - note: No tenant prerequisite/error is declared. Empty list is success; keep authoritative query_type=ad_hoc and generated pattern ordering. Projection retains _id; convert ids inside document_scope.document_ids when BSON values are returned. No writes.
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
          - response queries[]._id <- str(pattern._id)
          - response queries[].query_text <- pattern.query_text
          - response queries[].expected_answer_text <- pattern.expected_answer_text; absent -> null
          - response queries[].ground_truth_chunk_ids <- stringify each pattern.ground_truth_chunk_ids element; absent optional array -> []
          - response queries[].ground_truth_document_ids <- stringify each pattern.ground_truth_document_ids element; absent optional array -> []
          - response queries[].document_scope <- pattern.document_scope; absent -> null; stringify nested document_ids
          - response queries[].created_at <- pattern.created_at
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run prerequisite lookup returns None or is owned by a different tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.queries.run_qp_9(tenant_id=path.tenantId, benchmark_run_id=path.benchmarkRunId) after checking run existence and ownership.
          - note: Empty benchmark question set is success for an existing run, not BENCHMARK_RUN_NOT_FOUND. Keep query_type=benchmark verbatim. Projection retains _id; convert all projected BSON ids, including nested scope ids. Do not expose query_type/tenant_id/created_by or synthesize ground truth.
        """
        raise NotImplementedOperation()
