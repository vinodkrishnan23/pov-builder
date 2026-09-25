# Deterministic seed bundle v001

This bundle seeds POC `1790360041472` with Node.js 20 and the official MongoDB driver. Run with `npm run seed` after setting `MONGODB_URI`; `DB_NAME` defaults to `1790360041472`.

The script deterministically drops and recreates all seven POC collections. ObjectIds are SHA-256-derived from fixed seed 42, dates are fixed UTC values, relationship references are stable, and chunk embeddings are deterministic normalized vectors with 8 dimensions. It creates all declared ordinary indexes and declares Atlas Search indexes `search_chunks_text` and `vector_chunks_embedding`. Set `SEED_SKIP_SEARCH_INDEXES=1` only when search indexes are managed externally.

`SEED_MAX_DOCS` limits each collection and defaults to 20. `SEED_COLLECTION_CAPS` is an optional JSON object containing independent per-collection limits; each effective count is the minimum of 20, its cap, and `SEED_MAX_DOCS`.

## Deterministic defaults recorded from the resolved inputs

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

The `_id` indexes listed by the model are supplied automatically by MongoDB when each collection is created. The script prints one final JSON line whose `seed_summary` value is the direct collection-count object.
