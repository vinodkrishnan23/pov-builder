"""G6b: schema-driven fuzzing of every operation with fake services. No undeclared status
codes, no 5xx, responses must match their schemas. GENERATED - do not edit."""

from __future__ import annotations

import os

import schemathesis
from hypothesis import HealthCheck, settings
from schemathesis.checks import not_a_server_error
from schemathesis.specs.openapi.checks import response_schema_conformance, status_code_conformance

from app.api.deps import (
    get_benchmark_runs_service,
    get_chunk_profiles_service,
    get_chunks_service,
    get_documents_service,
    get_queries_service,
    get_query_results_service,
    get_tenants_service,
)
from app.main import create_app
from app.services.benchmark_runs import BenchmarkRunsService
from app.services.chunk_profiles import ChunkProfilesService
from app.services.chunks import ChunksService
from app.services.documents import DocumentsService
from app.services.queries import QueriesService
from app.services.query_results import QueryResultsService
from app.services.tenants import TenantsService
from tests.support.fakes import FakeService, provide


def _app():
    application = create_app()
    for provider, fake in {
        get_tenants_service: FakeService(TenantsService),
        get_documents_service: FakeService(DocumentsService),
        get_chunk_profiles_service: FakeService(ChunkProfilesService),
        get_chunks_service: FakeService(ChunksService),
        get_queries_service: FakeService(QueriesService),
        get_benchmark_runs_service: FakeService(BenchmarkRunsService),
        get_query_results_service: FakeService(QueryResultsService),
    }.items():
        application.dependency_overrides[provider] = provide(fake)
    return application


schema = schemathesis.openapi.from_asgi("/openapi.json", _app()).exclude(path="/api/health")


@schema.parametrize()
@settings(
    max_examples=int(os.environ.get("FUZZ_MAX_EXAMPLES", "25")),
    deadline=None,
    derandomize=True,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.filter_too_much,
        HealthCheck.function_scoped_fixture,
        HealthCheck.large_base_example,
    ],
)
def test_operation_fuzz(case) -> None:  # type: ignore[no-untyped-def]
    case.call_and_validate(
        checks=[not_a_server_error, status_code_conformance, response_schema_conformance]
    )
