# Traceability

| Requirement | Operation | Backing | Service method | Tests |
|---|---|---|---|---|
| FR-8, INT-5 | `createTenant` | tenants.insertOne | `TenantsService.create_tenant` | `tests/contract/test_tenants.py` |
| FR-8, INT-5 | `listTenants` | tenants.find | `TenantsService.list_tenants` | `tests/contract/test_tenants.py` |
| FR-8, INT-5 | `getTenant` | tenants.findOne | `TenantsService.get_tenant` | `tests/contract/test_tenants.py` |
| FR-8, INT-5 | `updateTenant` | tenants.updateOne | `TenantsService.update_tenant` | `tests/contract/test_tenants.py` |
| FR-1, FR-3, FR-6, FR-9, AI-3, UC-1, UC-2, SC-1, INT-3, INT-7 | `createDocument` | documents.insertOne | `DocumentsService.create_document` | `tests/contract/test_documents.py` |
| FR-1, FR-6, UC-1, UC-4, INT-7 | `listRetrievalReadyDocuments` | QP-1 | `DocumentsService.list_retrieval_ready_documents` | `tests/contract/test_documents.py` |
| FR-6, AI-3, UC-1, SC-1, INT-7 | `listDocumentIngestStatuses` | QP-2 | `DocumentsService.list_document_ingest_statuses` | `tests/contract/test_documents.py` |
| INT-3 | `getDocument` | documents.findOne | `DocumentsService.get_document` | `tests/contract/test_documents.py` |
| FR-9, AI-3, INT-3 | `updateDocument` | documents.updateOne | `DocumentsService.update_document` | `tests/contract/test_documents.py` |
| FR-6, FR-7, UC-1, UC-4 | `listChunkProfiles` | QP-3 | `ChunkProfilesService.list_chunk_profiles` | `tests/contract/test_chunk_profiles.py` |
| FR-7 | `createChunkProfile` | chunk_profiles.insertOne | `ChunkProfilesService.create_chunk_profile` | `tests/contract/test_chunk_profiles.py` |
| FR-7, UC-1, UC-4 | `getDocumentChunksByProfile` | QP-7 | `ChunksService.get_document_chunks_by_profile` | `tests/contract/test_chunks.py` |
| BO-5, FR-6, AI-4, UC-1, UC-2, UC-4 | `createQuery` | queries.insertOne | `QueriesService.create_query` | `tests/contract/test_queries.py` |
| FR-6, UC-1, UC-2 | `listRecentAdHocQueries` | QP-13 | `QueriesService.list_recent_ad_hoc_queries` | `tests/contract/test_queries.py` |
| AI-4, UC-4, SC-4 | `listBenchmarkQueries` | QP-9 | `QueriesService.list_benchmark_queries` | `tests/contract/test_queries.py` |
| BO-2, BO-4, FR-1, FR-4, FR-5, FR-6, FR-9, AI-1, AI-2, UC-1, SC-1 | `vectorSearchDocuments` | QP-4 | `ChunksService.vector_search_documents` | `tests/contract/test_chunks.py` |
| BO-1, BO-2, FR-1, FR-2, FR-4, FR-6, AI-1, UC-1, UC-3, SC-1 | `hybridSearchDocuments` | QP-5 | `ChunksService.hybrid_search_documents` | `tests/contract/test_chunks.py` |
| BO-4, FR-3, FR-4, FR-9, UC-2 | `searchAgentMemory` | QP-6 | `ChunksService.search_agent_memory` | `tests/contract/test_chunks.py` |
| BO-3, BO-5, AI-4, AI-5, UC-4, SC-3, SC-6, INT-1, INT-4 | `createBenchmarkRun` | benchmark_runs.insertOne | `BenchmarkRunsService.create_benchmark_run` | `tests/contract/test_benchmark_runs.py` |
| BO-5, UC-4 | `listBenchmarkRuns` | QP-8 | `BenchmarkRunsService.list_benchmark_runs` | `tests/contract/test_benchmark_runs.py` |
| BO-5, FR-7, UC-4 | `getBenchmarkRunDetail` | QP-14 | `BenchmarkRunsService.get_benchmark_run_detail` | `tests/contract/test_benchmark_runs.py` |
| UC-4 | `updateBenchmarkRun` | benchmark_runs.updateOne | `BenchmarkRunsService.update_benchmark_run` | `tests/contract/test_benchmark_runs.py` |
| BO-3, BO-4, BO-5, FR-4, AI-4, AI-5, AI-6, UC-4, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7, INT-1, INT-4 | `createQueryResult` | query_results.insertOne | `QueryResultsService.create_query_result` | `tests/contract/test_query_results.py` |
| BO-3, BO-5, FR-4, AI-4, AI-6, UC-4, SC-2, SC-3, SC-4, SC-7, INT-1, INT-4 | `getBenchmarkQueryComparison` | QP-10 | `QueryResultsService.get_benchmark_query_comparison` | `tests/contract/test_query_results.py` |
| BO-2, BO-3, BO-4, BO-5, AI-4, AI-5, AI-6, UC-4, SC-2, SC-4, SC-5, SC-6, INT-1, INT-4 | `getBenchmarkSummary` | QP-11 | `QueryResultsService.get_benchmark_summary` | `tests/contract/test_query_results.py` |
| BO-2, BO-3, BO-5, AI-6, UC-4, SC-7, INT-1, INT-4 | `getBenchmarkWins` | QP-12 | `QueryResultsService.get_benchmark_wins` | `tests/contract/test_query_results.py` |

## Requirements without a backend operation

