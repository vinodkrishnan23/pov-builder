# Deterministic seed bundle v003

This Node.js 20 bundle uses the official MongoDB driver to seed POC `1790360041472`. Run `npm run seed` with `MONGODB_URI`; `DB_NAME` defaults to `1790360041472`.

The script deterministically drops and recreates all seven POC collections. ObjectIds derive from SHA-256 and fixed seed 42, dates are fixed UTC values, references are stable, and vectors have eight deterministic dimensions. All declared ordinary indexes are created. Atlas Search indexes `search_chunks_text` and `vector_chunks_embedding` match the static search requirements; set `SEED_SKIP_SEARCH_INDEXES=1` when they are managed externally.

`SEED_MAX_DOCS` defaults to 20 and is the absolute per-collection maximum. `SEED_COLLECTION_CAPS` optionally supplies independent non-negative per-collection caps as a JSON object. Every effective count is the minimum of 20, the global maximum, and its collection cap.

## v003 repair

QP-1's symbolic `<pageSize>` caused MongoDB cursor `limit` validation to fail. The repair metadata supplies integer `10` for QP-1 and all other page-size patterns. It also records deterministic vector placeholder values `topK=5` and `numCandidates=20`.

## Deterministic defaults returned by the resolved inputs

- tenants: derived relationship indexes
- tenants: seed count 20
- documents: derived relationship indexes
- documents: seed count 20
- chunk_profiles: derived relationship indexes
- chunk_profiles: seed count 20
- chunks: derived relationship indexes
- chunks: seed count 20
- queries: derived relationship indexes
- queries: seed count 20
- benchmark_runs: derived relationship indexes
- benchmark_runs: seed count 20
- query_results: derived relationship indexes
- query_results: seed count 20
- QP-4: synthetic vector dimensions 8
- QP-6: synthetic vector dimensions 8
- documents: derived query index created_at
- documents: derived query index document_type
- documents: derived query index ingest_status
- documents: derived query index source_system
- documents: derived query index updated_at
- chunk_profiles: derived query index is_active
- chunk_profiles: derived query index name
- chunk_profiles: derived query index strategy
- chunk_profiles: derived query index _id
- chunks: derived query index chunk_index
- benchmark_runs: derived query index created_at
- benchmark_runs: derived query index status
- queries: derived query index created_at
- queries: derived query index query_type
- query_results: derived query index approach
- query_results: derived query index tenant_id
- benchmark_runs: derived query index _id
- benchmark_runs: derived query index chunk_profile_ids

MongoDB creates the declared `_id` indexes automatically with each collection. On success, the script prints exactly one final JSON line with the direct collection-count object under `seed_summary`.
