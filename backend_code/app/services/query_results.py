"""Business logic for the `query_results` resource.

Generated stub: method SIGNATURES are frozen (checked by G8). Implement method bodies and
add private helpers (names starting with "_") only."""

from __future__ import annotations

from app.api.schemas import (
    CreateQueryResultRequest,
    CreateQueryResultResponse,
    GetBenchmarkQueryComparisonResponse,
    GetBenchmarkSummaryResponse,
    GetBenchmarkWinsResponse,
)
from app.db.repositories import Repositories
from app.errors import (
    NotImplementedOperation,
)


class QueryResultsService:
    """Operations: createQueryResult, getBenchmarkQueryComparison, getBenchmarkSummary, getBenchmarkWins."""

    def __init__(self, repos: Repositories) -> None:
        self.repos = repos

    async def create_query_result(
        self, *, body: CreateQueryResultRequest, tenant_id: str
    ) -> CreateQueryResultResponse:
        """createQueryResult - POST /api/v1/tenants/{tenantId}/query-results -> 201

        Purpose: Persist retrieval outputs and evaluation metrics for one query execution under one approach.

        Backing: query_results.insertOne filter=null
        Errors (raise exactly these from app.errors):
          - ValidationError (400 VALIDATION_ERROR): Missing required fields or invalid enum values.
          - QueryNotFound (404 QUERY_NOT_FOUND): query_id does not exist for the tenant.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): benchmark_run_id is provided but does not exist for the tenant.
        Note: Backing (as written in the contract): CRUD insertOne on query_results
        Binding plan:
          - prerequisite: Await repos.queries.find_one_by_id(body.query_id); None or tenant_id != path.tenantId -> QUERY_NOT_FOUND. If body.benchmark_run_id is provided, await repos.benchmark_runs.find_one_by_id(body.benchmark_run_id); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response query_result._id <- doc._id
          - response query_result.benchmark_run_id <- doc.benchmark_run_id
          - response query_result.query_id <- doc.query_id
          - response query_result.tenant_id <- doc.tenant_id
          - response query_result.approach <- doc.approach
          - response query_result.chunk_profile_id <- doc.chunk_profile_id
          - response query_result.retrieval_mode <- doc.retrieval_mode
          - response query_result.latency_ms <- doc.latency_ms
          - response query_result.top_k_requested <- doc.top_k_requested
          - response query_result.results <- doc.results, preserving supplied rank/chunk_id/document_id/score/rerank_score/text_snippet/source_title/is_ground_truth_match and optional-member absence
          - response query_result.metrics <- doc.metrics; absent -> null; preserve supplied precision_at_k/recall_at_k/mrr/ndcg
          - response query_result.created_at <- doc.created_at
          - rule: Missing required fields, invalid enum values or invalid declared ids not caught by routes. -> raise VALIDATION_ERROR
          - rule: query_id lookup is missing or owned by a different tenant. -> raise QUERY_NOT_FOUND
          - rule: Explicitly provided benchmark_run_id lookup is missing or owned by a different tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.insert_one with QueryResultsDocument populated from all declared body fields plus tenant_id=path.tenantId, generated id and UTC created_at; return inserted document.
          - note: Persist supplied results, rerank_score and metrics, never execute retrieval/reranking, compute evaluation metrics, modify query/run state, or validate referenced chunks/documents/profiles. No TENANT_NOT_FOUND is declared; query ownership suffices.
          - note: Do not infer benchmark_run_id from the query or require equality with query.benchmark_run_id; the only run rule is existence/tenant ownership when explicitly provided. No rank sequencing, unique rank, count/top-k consistency or numeric metric bounds are declared.
          - note: Optional members of results are not required; preserve their absence and provided values in the arbitrary results response payload. Convert declared nested ObjectIds through document/repository facilities, not bson imports.
        """
        raise NotImplementedOperation()

    async def get_benchmark_query_comparison(
        self, *, tenant_id: str, benchmark_run_id: str, query_id: str
    ) -> GetBenchmarkQueryComparisonResponse:
        """getBenchmarkQueryComparison - GET /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId}/queries/{queryId}/comparisons -> 200

        Purpose: Get side-by-side results for one benchmark query across approaches and chunk profiles.

        Backing: query pattern QP-10 -> repos.<collection>.run_qp_10(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): Any path id is invalid.
          - QueryOrRunNotFound (404 QUERY_OR_RUN_NOT_FOUND): No matching query/run exists for the tenant.
        Note: Backing (as written in the contract): QP-10
        Binding plan:
          - placeholder QP-10 <tenantId> <- path.tenantId
          - placeholder QP-10 <benchmarkRunId> <- path.benchmarkRunId
          - placeholder QP-10 <queryId> <- path.queryId
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId) and repos.queries.find_one_by_id(path.queryId). Missing either, either tenant_id != path.tenantId, or query.benchmark_run_id != path.benchmarkRunId -> QUERY_OR_RUN_NOT_FOUND; these reads check that the requested query/run relationship exists.
          - response comparisons[].approach <- pattern.approach
          - response comparisons[].retrieval_mode <- pattern.retrieval_mode
          - response comparisons[].latency_ms <- pattern.latency_ms
          - response comparisons[].top_k_requested <- pattern.top_k_requested
          - response comparisons[].results[].rank <- pattern.results[].rank (stored rank, not a new enumeration)
          - response comparisons[].results[].chunk_id <- stringify pattern.results[].chunk_id when present/non-null; otherwise null
          - response comparisons[].results[].document_id <- stringify pattern.results[].document_id when present/non-null; otherwise null
          - response comparisons[].results[].score <- pattern.results[].score; absent -> null
          - response comparisons[].results[].rerank_score <- pattern.results[].rerank_score; absent -> null
          - response comparisons[].results[].text_snippet <- pattern.results[].text_snippet; absent -> null
          - response comparisons[].results[].source_title <- pattern.results[].source_title; absent -> null
          - response comparisons[].results[].is_ground_truth_match <- pattern.results[].is_ground_truth_match; absent -> null
          - response comparisons[].metrics.precision_at_k <- pattern.metrics.precision_at_k; absent -> null
          - response comparisons[].metrics.recall_at_k <- pattern.metrics.recall_at_k; absent -> null
          - response comparisons[].metrics.mrr <- pattern.metrics.mrr; absent -> null
          - response comparisons[].metrics.ndcg <- pattern.metrics.ndcg; absent -> null
          - response comparisons[].chunk_profile <- pattern.chunk_profile; empty dict -> null subject to noted nonnullable-schema blocker
          - response comparisons[].chunk_profile.name <- pattern.chunk_profile.name when nonempty; absent member -> null
          - response comparisons[].chunk_profile.strategy <- pattern.chunk_profile.strategy when nonempty; absent member -> null
          - rule: Any path id is not a valid ObjectId string. -> raise INVALID_ID
          - rule: No matching tenant-owned query/run pair exists as established by the prerequisite reads; an empty result set for an existing pair is not itself an error. -> raise QUERY_OR_RUN_NOT_FOUND
          - note: Await repos.query_results.run_qp_10(tenant_id=path.tenantId, benchmark_run_id=path.benchmarkRunId, query_id=path.queryId) after validating the matching query/run. Do not equate no stored executions with no query/run: valid query/run with no results returns comparisons=[].
          - note: Preserve QP-10 approach/profile strategy ordering. Do not rerank results, recompute metrics, deduplicate executions or expose implicit _id.
          - note: $lookup plus preserving $unwind plus nested $project produces chunk_profile={} when unmatched. Normalize empty join subdocument to null where response permits. Contract mismatch: this response's chunk_profile object is NOT marked nullable (only its children are); null normalization is incompatible if the generated model enforces nonnull. Do not fabricate a profile or change the model. This case requires contract/generator clarification; if the generated model permits null, use null. A strict nonnull model can only represent an absent profile as {name:null,strategy:null}, contrary to the requested empty-subdocument-to-null convention.
          - note: metrics is also optional in storage but its response object is not nullable. Project missing metric members as declared nullable children if a metrics container is required, with no computed substitutes. Preserve optional results members as null in this response.
        """
        raise NotImplementedOperation()

    async def get_benchmark_summary(
        self, *, tenant_id: str, benchmark_run_id: str
    ) -> GetBenchmarkSummaryResponse:
        """getBenchmarkSummary - GET /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId}/summary -> 200

        Purpose: Get aggregate benchmark metrics by approach, retrieval mode, chunk profile, and top-k.

        Backing: query pattern QP-11 -> repos.<collection>.run_qp_11(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): tenantId or benchmarkRunId is invalid.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): Run does not exist for tenant.
        Note: Backing (as written in the contract): QP-11
        Binding plan:
          - placeholder QP-11 <tenantId> <- path.tenantId
          - placeholder QP-11 <benchmarkRunId> <- path.benchmarkRunId
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response summary[].approach <- pattern._id.approach
          - response summary[].retrieval_mode <- pattern._id.retrieval_mode
          - response summary[].chunk_profile_id <- str(pattern._id.chunk_profile_id) if present/non-null; otherwise null
          - response summary[].top_k_requested <- pattern._id.top_k_requested
          - response summary[].avg_latency_ms <- pattern.avg_latency_ms
          - response summary[].query_count <- pattern.query_count
          - response summary[].avg_mrr <- pattern.avg_mrr
          - response summary[].avg_ndcg <- pattern.avg_ndcg
          - response summary[].avg_precision_at_1 <- pattern.avg_precision_at_1
          - response summary[].avg_precision_at_5 <- pattern.avg_precision_at_5
          - response summary[].avg_precision_at_10 <- pattern.avg_precision_at_10
          - response summary[].avg_precision_at_20 <- pattern.avg_precision_at_20
          - response summary[].avg_recall_at_1 <- pattern.avg_recall_at_1
          - response summary[].avg_recall_at_5 <- pattern.avg_recall_at_5
          - response summary[].avg_recall_at_10 <- pattern.avg_recall_at_10
          - response summary[].avg_recall_at_20 <- pattern.avg_recall_at_20
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run prerequisite lookup returns None or belongs to a different tenant; empty aggregation alone is not not-found. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.run_qp_11(tenant_id=path.tenantId, benchmark_run_id=path.benchmarkRunId) after the run prerequisite. Existing run with no executions returns summary=[].
          - note: QP-11 ends at $group/$sort, not a flat $project: approach/retrieval_mode/chunk_profile_id/top_k_requested are under pattern._id. Flatten only for response; never alter the pattern.
          - note: query_count is the pattern's count of execution documents, not distinct query ids. Retain all averages and nulls exactly; no recomputation, zero fill or fabricated precision keys. Preserve returned group order.
        """
        raise NotImplementedOperation()

    async def get_benchmark_wins(
        self, *, tenant_id: str, benchmark_run_id: str
    ) -> GetBenchmarkWinsResponse:
        """getBenchmarkWins - GET /api/v1/tenants/{tenantId}/benchmark-runs/{benchmarkRunId}/wins -> 200

        Purpose: Identify benchmark queries where MongoDB/Voyage outperforms a baseline on relevance and/or latency.

        Backing: query pattern QP-12 -> repos.<collection>.run_qp_12(...)
        Errors (raise exactly these from app.errors):
          - InvalidId (400 INVALID_ID): tenantId or benchmarkRunId is invalid.
          - BenchmarkRunNotFound (404 BENCHMARK_RUN_NOT_FOUND): Run does not exist for tenant.
        Note: Backing (as written in the contract): QP-12
        Binding plan:
          - placeholder QP-12 <tenantId> <- path.tenantId
          - placeholder QP-12 <benchmarkRunId> <- path.benchmarkRunId
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response wins[].query_id <- str(pattern._id)
          - response wins[].mongodb_voyage.approach <- pattern.mongodb_voyage.approach (mongodb_voyage for an actually selected record)
          - response wins[].mongodb_voyage.latency_ms <- pattern.mongodb_voyage.latency_ms; absent metric -> null
          - response wins[].mongodb_voyage.mrr <- pattern.mongodb_voyage.mrr; absent -> null
          - response wins[].mongodb_voyage.ndcg <- pattern.mongodb_voyage.ndcg; absent -> null
          - response wins[].mongodb_voyage.precision_at_5 <- pattern.mongodb_voyage.precision_at_5; absent -> null
          - response wins[].mongodb_voyage.recall_at_5 <- pattern.mongodb_voyage.recall_at_5; absent -> null
          - response wins[].baseline.approach <- pattern.baseline.approach; missing selected baseline is the noted contract blocker, not an invented default
          - response wins[].baseline.latency_ms <- pattern.baseline.latency_ms; absent metric -> null
          - response wins[].baseline.mrr <- pattern.baseline.mrr; absent -> null
          - response wins[].baseline.ndcg <- pattern.baseline.ndcg; absent -> null
          - response wins[].baseline.precision_at_5 <- pattern.baseline.precision_at_5; absent -> null
          - response wins[].baseline.recall_at_5 <- pattern.baseline.recall_at_5; absent -> null
          - response wins[].is_better_on_mrr <- pattern.is_better_on_mrr
          - response wins[].is_better_on_ndcg <- pattern.is_better_on_ndcg
          - response wins[].is_better_on_precision_at_5 <- pattern.is_better_on_precision_at_5
          - response wins[].is_better_on_recall_at_5 <- pattern.is_better_on_recall_at_5
          - response wins[].is_lower_latency <- pattern.is_lower_latency
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run prerequisite lookup returns None or belongs to a different tenant; no-results/no-baseline/no-wins are not run-not-found errors. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.run_qp_12(tenant_id=path.tenantId, benchmark_run_id=path.benchmarkRunId). Existing run with no execution groups returns wins=[].
          - note: The group key pattern._id is query id; convert it to query_id. Keep the pattern's first MongoDB/Voyage record and first baseline record as selected by $first/$filter. Do not choose the strongest baseline, pair by profile/top-k, add sorting, aggregate duplicates or recompute flags.
          - note: QP-12 has no final win-only $match. Return its rows and comparison booleans verbatim, including rows whose flags are all false; endpoint name/purpose does not authorize altering the authoritative pattern.
          - note: Nullable metric members absent in selected records map to null; preserve pattern boolean semantics even with missing metrics, do not reinterpret missing as zero.
          - note: Contract blocker for partial comparison data: QP-12 can emit groups missing MongoDB/Voyage or a baseline, but both response subobjects require a nonnullable approach enum and no error is declared for missing comparison sides. No faithful response mapping exists for those groups. Do not invent a baseline approach, fabricate a MongoDB record, drop groups, or raise BENCHMARK_RUN_NOT_FOUND for a real run. Contract/generator clarification is required (nullable sides or an authoritative selection rule). Mapping below is executable for groups with both selected sides.
        """
        raise NotImplementedOperation()
