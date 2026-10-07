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
          - prerequisite: Await repos.queries.find_one_by_id(body.query_id); None or tenant_id != path.tenantId -> QUERY_NOT_FOUND. If body.benchmark_run_id supplied, await repos.benchmark_runs.find_one_by_id(value); None or tenant mismatch -> BENCHMARK_RUN_NOT_FOUND.
          - response query_result <- transform inserted document: _id, benchmark_run_id, query_id, tenant_id, approach, chunk_profile_id, retrieval_mode, latency_ms, top_k_requested, results, metrics, created_at from doc.same_named_field; absent benchmark_run_id/chunk_profile_id/metrics -> null; nested result identifiers serialize as hex strings; include supplied result payload fields without generating values
          - rule: Missing required fields, invalid identifier formats or enum values. -> raise VALIDATION_ERROR
          - rule: query_id lookup returns None or query is not owned by tenant. -> raise QUERY_NOT_FOUND
          - rule: Supplied benchmark_run_id lookup returns None or run is not owned by tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.insert_one with declared body fields, tenant_id=tenantId, generated _id/UTC created_at; return constructed stored document.
          - note: Persist supplied results, rerank scores, latency and metrics verbatim. Do not run retrieval/reranking, calculate metrics, verify result chunk/document references or impose query/run consistency beyond declared tenant ownership checks.
          - note: Do not look up the tenant separately: TENANT_NOT_FOUND is not declared. Do not require supplied benchmark_run_id to equal query.benchmark_run_id; no such rule is specified.
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
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId) and repos.queries.find_one_by_id(path.queryId); missing either, either tenant mismatch, or query.benchmark_run_id != path.benchmarkRunId -> QUERY_OR_RUN_NOT_FOUND.
          - response comparisons[].approach <- pattern.approach
          - response comparisons[].retrieval_mode <- pattern.retrieval_mode
          - response comparisons[].latency_ms <- pattern.latency_ms
          - response comparisons[].top_k_requested <- pattern.top_k_requested
          - response comparisons[].results[].rank <- pattern.results[].rank (stored rank, not re-enumerated)
          - response comparisons[].results[].chunk_id <- transform str(pattern.results[].chunk_id) when non-null; absent -> null
          - response comparisons[].results[].document_id <- transform str(pattern.results[].document_id) when non-null; absent -> null
          - response comparisons[].results[].score <- transform pattern.results[].score; absent -> null
          - response comparisons[].results[].rerank_score <- transform pattern.results[].rerank_score; absent -> null
          - response comparisons[].results[].text_snippet <- transform pattern.results[].text_snippet; absent -> null
          - response comparisons[].results[].source_title <- transform pattern.results[].source_title; absent -> null
          - response comparisons[].results[].is_ground_truth_match <- transform pattern.results[].is_ground_truth_match; absent -> null
          - response comparisons[].metrics.precision_at_k <- transform pattern.metrics.precision_at_k; absent -> null when metrics object emitted
          - response comparisons[].metrics.recall_at_k <- transform pattern.metrics.recall_at_k; absent -> null when metrics object emitted
          - response comparisons[].metrics.mrr <- transform pattern.metrics.mrr; absent -> null when metrics object emitted
          - response comparisons[].metrics.ndcg <- transform pattern.metrics.ndcg; absent -> null when metrics object emitted
          - response comparisons[].chunk_profile.name <- transform pattern.chunk_profile.name; missing lookup/empty subdocument -> null child
          - response comparisons[].chunk_profile.strategy <- transform pattern.chunk_profile.strategy; missing lookup/empty subdocument -> null child
          - rule: Any path id is not a valid ObjectId string. -> raise INVALID_ID
          - rule: No query and run matching tenantId, benchmarkRunId and queryId exist as checked by prerequisite reads. -> raise QUERY_OR_RUN_NOT_FOUND
          - note: After matching query/run ownership prerequisite, await repos.query_results.run_qp_10(tenant_id=tenantId,benchmark_run_id=benchmarkRunId,query_id=queryId). Preserve approach/chunk-profile-strategy sort.
          - note: An existing matching query/run with no results returns comparisons=[], not a not-found error: empty result rows alone do not prove parent absence.
          - note: Missing profile lookup with preserveNullAndEmptyArrays yields chunk_profile={}. Map this empty subdocument to null only if generated response permits nullable parent; otherwise emit the declared object {name:null,strategy:null}. The supplied schema does not mark the parent nullable, so use the latter, not an invalid null response.
          - note: Missing metrics likewise follows generated optional-parent omission/default; if an object is emitted, its declared nullable child fields are null. Do not recompute metrics or rerank results. Exclude implicit _id and internal fields.
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
          - response summary[].approach <- transform pattern._id.approach -> approach
          - response summary[].retrieval_mode <- transform pattern._id.retrieval_mode -> retrieval_mode
          - response summary[].chunk_profile_id <- transform str(pattern._id.chunk_profile_id) when present/non-null; otherwise null
          - response summary[].top_k_requested <- transform pattern._id.top_k_requested -> top_k_requested
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
          - rule: Run lookup returns None or tenant ownership fails; empty metrics are not a missing-run condition. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: After run ownership read, await repos.query_results.run_qp_11(tenant_id=tenantId,benchmark_run_id=benchmarkRunId). QP-11 ends in $group/$sort without flattening projection: grouping keys remain under row._id.
          - note: Flatten grouping key fields exactly; convert nullable group chunk_profile_id to hex string. All average values come from MongoDB, not service calculations; preserve null missing-metric averages.
          - note: query_count counts query_result documents via $sum:1, not distinct queries. Preserve authoritative sort; existing run with no results returns summary=[].
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
          - response wins[].query_id <- transform str(pattern._id) -> query_id
          - response wins[].mongodb_voyage.approach <- pattern.mongodb_voyage.approach (when side exists; never synthesize an absent side)
          - response wins[].mongodb_voyage.latency_ms <- transform pattern.mongodb_voyage.latency_ms; absent numeric field -> null
          - response wins[].mongodb_voyage.mrr <- transform pattern.mongodb_voyage.mrr; absent numeric field -> null
          - response wins[].mongodb_voyage.ndcg <- transform pattern.mongodb_voyage.ndcg; absent numeric field -> null
          - response wins[].mongodb_voyage.precision_at_5 <- transform pattern.mongodb_voyage.precision_at_5; absent numeric field -> null
          - response wins[].mongodb_voyage.recall_at_5 <- transform pattern.mongodb_voyage.recall_at_5; absent numeric field -> null
          - response wins[].baseline.approach <- pattern.baseline.approach (first eligible baseline selected by QP-12)
          - response wins[].baseline.latency_ms <- transform pattern.baseline.latency_ms; absent numeric field -> null
          - response wins[].baseline.mrr <- transform pattern.baseline.mrr; absent numeric field -> null
          - response wins[].baseline.ndcg <- transform pattern.baseline.ndcg; absent numeric field -> null
          - response wins[].baseline.precision_at_5 <- transform pattern.baseline.precision_at_5; absent numeric field -> null
          - response wins[].baseline.recall_at_5 <- transform pattern.baseline.recall_at_5; absent numeric field -> null
          - response wins[].is_better_on_mrr <- pattern.is_better_on_mrr
          - response wins[].is_better_on_ndcg <- pattern.is_better_on_ndcg
          - response wins[].is_better_on_precision_at_5 <- pattern.is_better_on_precision_at_5
          - response wins[].is_better_on_recall_at_5 <- pattern.is_better_on_recall_at_5
          - response wins[].is_lower_latency <- pattern.is_lower_latency
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run lookup is None or run is not owned by tenant. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: After run ownership read, await repos.query_results.run_qp_12(tenant_id=tenantId,benchmark_run_id=benchmarkRunId). QP-12 preserves grouped query identifier as _id; rename it to query_id.
          - note: Preserve MongoDB booleans exactly, including missing/null comparison semantics. Do not recompute comparisons in Python, choose a best baseline, average duplicate approaches, or add filters for successful wins. QP-12 returns all grouped comparisons, including rows with all flags false.
          - note: QP-12 chooses the first MongoDB/Voyage entry and first eligible baseline in unsorted $push order; this is not a deterministic best/fastest target. Exclude by_approach and _id from response.
          - note: Contract gap: QP-12 can emit a group with one side entirely absent, whereas response side objects have non-nullable approach enums and no declared fallback/error. Omit an absent side only if the generated optional-field schema permits it; do not invent an approach, map it to an invalid null, skip rows, or raise BENCHMARK_RUN_NOT_FOUND for missing comparison sides. If generated models require both sides, this case needs contract correction, not a service workaround.
          - note: Missing numeric fields within an existing side map to null. Existing tenant-owned run without query_results returns wins=[].
        """
        raise NotImplementedOperation()
