# Deterministic MongoDB seed (`v001`)

This bundle recreates the seven POC collections and inserts deterministic data using Node.js 20 and the official MongoDB driver. ObjectIds are derived from SHA-256 hashes with seed `42`; dates and all other values are fixed by collection and row index.

## Run

```bash
npm install
MONGODB_URI='…' npm run seed
```

Environment variables:

- `MONGODB_URI` (required): MongoDB connection URI.
- `DB_NAME` (optional): database override; defaults to `1790360041472`.
- `SEED_MAX_DOCS` (optional): non-negative per-collection maximum.
- `SEED_COLLECTION_CAPS` (optional): JSON object containing independent non-negative per-collection caps. Each effective count is the minimum of 20, `SEED_MAX_DOCS`, and its collection cap.

The script drops and recreates only the model's POC collections, creates all declared and relationship-derived indexes, and emits one final JSON summary line on success.

## Deterministic defaults returned by the data-model input

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
