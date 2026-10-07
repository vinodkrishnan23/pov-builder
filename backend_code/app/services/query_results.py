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
          - prerequisite: Await repos.queries.find_one_by_id(body.query_id); None or tenant_id != path.tenantId -> QUERY_NOT_FOUND. If body.benchmark_run_id is supplied, await repos.benchmark_runs.find_one_by_id(value); None or tenant_id != path.tenantId -> BENCHMARK_RUN_NOT_FOUND.
          - response query_result._id <- doc._id
          - response query_result.benchmark_run_id <- doc.benchmark_run_id; absent -> null
          - response query_result.query_id <- doc.query_id
          - response query_result.tenant_id <- doc.tenant_id
          - response query_result.approach <- doc.approach
          - response query_result.chunk_profile_id <- doc.chunk_profile_id; absent -> null
          - response query_result.retrieval_mode <- doc.retrieval_mode
          - response query_result.latency_ms <- doc.latency_ms
          - response query_result.top_k_requested <- doc.top_k_requested
          - response query_result.results <- doc.results; preserve supplied rank and optional chunk_id, document_id, score, rerank_score, text_snippet, source_title, is_ground_truth_match without deriving values
          - response query_result.metrics <- doc.metrics; absent -> null; preserve precision_at_k, recall_at_k, mrr and ndcg
          - response query_result.created_at <- doc.created_at
          - rule: Missing required fields or invalid enum/ID/type values are validation failures; do not invent metric bounds, rank ordering, nonnegative latency or top-k consistency checks. -> raise VALIDATION_ERROR
          - rule: Required query lookup is absent or outside tenant scope. -> raise QUERY_NOT_FOUND
          - rule: Provided benchmark run is absent or outside tenant scope. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Construct QueryResultsDocument from declared body, tenant_id=tenantId, generated ID/default mechanism and aware UTC created_at; await repos.query_results.insert_one and return the constructed record.
          - note: Only the declared query and optional benchmark-run ownership checks are required. Do not require query.benchmark_run_id == body.benchmark_run_id or validate result/profile/document/chunk reference existence; no such constraints/errors are declared.
          - note: Persist supplied results, rerank_score and metrics without retrieval, reranking, metric computation, timing or other writes. No additional tenant-existence check or conflict handling is declared.
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
          - prerequisite: Await repos.benchmark_runs.find_one_by_id(path.benchmarkRunId) and repos.queries.find_one_by_id(path.queryId); missing run/query, either tenant_id != path.tenantId, or query.benchmark_run_id != path.benchmarkRunId -> QUERY_OR_RUN_NOT_FOUND. These checks distinguish absent query/run from existing pair with no stored results.
          - response comparisons[].approach <- pattern.approach
          - response comparisons[].retrieval_mode <- pattern.retrieval_mode
          - response comparisons[].latency_ms <- pattern.latency_ms
          - response comparisons[].top_k_requested <- pattern.top_k_requested
          - response comparisons[].results[].rank <- pattern.results[].rank; preserve stored rank
          - response comparisons[].results[].chunk_id <- transform str(pattern.results[].chunk_id) when nonnull; absent -> null
          - response comparisons[].results[].document_id <- transform str(pattern.results[].document_id) when nonnull; absent -> null
          - response comparisons[].results[].score <- pattern.results[].score; absent -> null
          - response comparisons[].results[].rerank_score <- pattern.results[].rerank_score; absent -> null
          - response comparisons[].results[].text_snippet <- pattern.results[].text_snippet; absent -> null
          - response comparisons[].results[].source_title <- pattern.results[].source_title; absent -> null
          - response comparisons[].results[].is_ground_truth_match <- pattern.results[].is_ground_truth_match; absent -> null
          - response comparisons[].metrics <- transform pattern.metrics container; absent -> generated omission or null only if generated schema permits; nonnullable required container is a contract gap
          - response comparisons[].metrics.precision_at_k <- pattern.metrics.precision_at_k; absent -> null
          - response comparisons[].metrics.recall_at_k <- pattern.metrics.recall_at_k; absent -> null
          - response comparisons[].metrics.mrr <- pattern.metrics.mrr; absent -> null
          - response comparisons[].metrics.ndcg <- pattern.metrics.ndcg; absent -> null
          - response comparisons[].chunk_profile <- transform pattern.chunk_profile: {} or missing -> null, subject to response-nullability reconciliation noted above
          - response comparisons[].chunk_profile.name <- pattern.chunk_profile.name when profile exists; absent -> null
          - response comparisons[].chunk_profile.strategy <- pattern.chunk_profile.strategy when profile exists; absent -> null
          - rule: Any path ID is not a valid ObjectId string. -> raise INVALID_ID
          - rule: No matching query/run pair exists for the tenant: missing or wrong-tenant run/query or query not associated with this run. Empty comparison rows alone do not prove absence of the pair. -> raise QUERY_OR_RUN_NOT_FOUND
          - note: After existence/scope checks, await repos.query_results.run_qp_10(tenant_id=tenantId,benchmark_run_id=benchmarkRunId,query_id=queryId). Preserve pattern sort by approach/profile strategy. Existing matching query/run with no stored results -> comparisons=[], not a fabricated not-found condition.
          - note: QP lookup preserves missing profiles and projects chunk_profile={}. Normalize this empty subdocument to null rather than treat it as a populated profile. CONTRACT GAP: response declares chunk_profile object, not nullable; use generated omission if optional, but if the frozen response requires a nonnull object the contract/generator must reconcile nullability. Do not invent profile labels or silently manufacture a match.
          - note: Absent metrics also need generated omission/nullability reconciliation because metrics container is not marked nullable even though stored metrics is optional. Missing nullable metric leaves -> null when an actual metrics container exists. Do not compute scores/metrics/reranking.
          - note: Stringify nested result chunk_id/document_id only when nonnull. Exclude implicit top-level _id and undeclared fields. No writes.
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
          - response summary[].chunk_profile_id <- transform str(pattern._id.chunk_profile_id) when nonnull; absent/null -> null
          - response summary[].top_k_requested <- transform pattern._id.top_k_requested -> top_k_requested
          - response summary[].avg_latency_ms <- pattern.avg_latency_ms
          - response summary[].query_count <- pattern.query_count
          - response summary[].avg_mrr <- pattern.avg_mrr; null stays null
          - response summary[].avg_ndcg <- pattern.avg_ndcg; null stays null
          - response summary[].avg_precision_at_1 <- pattern.avg_precision_at_1; null stays null
          - response summary[].avg_precision_at_5 <- pattern.avg_precision_at_5; null stays null
          - response summary[].avg_precision_at_10 <- pattern.avg_precision_at_10; null stays null
          - response summary[].avg_precision_at_20 <- pattern.avg_precision_at_20; null stays null
          - response summary[].avg_recall_at_1 <- pattern.avg_recall_at_1; null stays null
          - response summary[].avg_recall_at_5 <- pattern.avg_recall_at_5; null stays null
          - response summary[].avg_recall_at_10 <- pattern.avg_recall_at_10; null stays null
          - response summary[].avg_recall_at_20 <- pattern.avg_recall_at_20; null stays null
          - rule: tenantId or benchmarkRunId is not a valid ObjectId string. -> raise INVALID_ID
          - rule: Run ownership lookup is absent or wrong tenant; empty summary is not a not-found condition for an existing run. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.run_qp_11(tenant_id=tenantId,benchmark_run_id=benchmarkRunId) after run ownership check. Flatten group _id fields into response fields; exclude grouped _id itself.
          - note: Preserve pattern aggregation and sort. query_count counts stored result executions via $sum, not distinct queries; never recompute. Missing/non-numeric metric averages are BSON null and remain null, never zero. Existing run with no results -> summary=[]. No writes.
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
          - response wins[].query_id <- transform str(pattern._id)
          - response wins[].mongodb_voyage <- transform pattern.mongodb_voyage container; missing/empty -> null only if generated schema permits or generated omission; required nonnullable case is contract gap
          - response wins[].mongodb_voyage.approach <- pattern.mongodb_voyage.approach when present; do not synthesize missing execution
          - response wins[].mongodb_voyage.latency_ms <- pattern.mongodb_voyage.latency_ms; absent -> null
          - response wins[].mongodb_voyage.mrr <- pattern.mongodb_voyage.mrr; absent -> null
          - response wins[].mongodb_voyage.ndcg <- pattern.mongodb_voyage.ndcg; absent -> null
          - response wins[].mongodb_voyage.precision_at_5 <- pattern.mongodb_voyage.precision_at_5; absent -> null
          - response wins[].mongodb_voyage.recall_at_5 <- pattern.mongodb_voyage.recall_at_5; absent -> null
          - response wins[].baseline <- transform pattern.baseline container; missing/empty -> null only if generated schema permits or generated omission; required nonnullable case is contract gap
          - response wins[].baseline.approach <- pattern.baseline.approach when present; no default approach is defined
          - response wins[].baseline.latency_ms <- pattern.baseline.latency_ms; absent -> null
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
          - rule: Run lookup is absent or outside tenant scope, not merely lacking result rows or paired approaches. -> raise BENCHMARK_RUN_NOT_FOUND
          - note: Await repos.query_results.run_qp_12(tenant_id=tenantId,benchmark_run_id=benchmarkRunId) after run ownership check. Pattern retains _id=query_id implicitly; rename/stringify it. Copy nested metric values and comparison booleans without recomputation.
          - note: QP-12 selects the first stored MongoDB/Voyage execution and first execution among all allowed baseline approaches; there is no authoritative sort before $first. Do not choose the best baseline, compare all baselines, align top-k/profile/mode, or reorder this pattern.
          - note: Despite the endpoint name, QP-12 has no final match filtering to true wins. Return all projected comparison rows, including rows whose five flags are false; do not add an OR filter or derive new win criteria.
          - note: CONTRACT GAP: a query may have no MongoDB/Voyage row or no baseline row, and QP-12 can then omit/null that nested object. Response declares these objects nonnullable and baseline.approach has no fixed default. Normalize missing/empty objects to null only if frozen response permits or use generated omission when optional; if required/nonnullable, flag this as an unresolved contract/generator mismatch. Do not fabricate an approach, discard rows, or misuse BENCHMARK_RUN_NOT_FOUND for incomplete pairs.
          - note: Existing run with no results -> wins=[]. Nullable metric values stay null; QP booleans reflect MongoDB's own comparisons, including missing/null behavior, not Python reinterpretation. No writes.
        """
        raise NotImplementedOperation()
