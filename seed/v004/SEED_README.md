# Deterministic MongoDB seed v004

This bundle seeds the POC database with Node.js 20 and the official MongoDB driver.

## Run

```sh
npm install
MONGODB_URI='<mongodb-uri>' npm run seed
```

`DB_NAME` optionally selects the database; its deterministic runtime default is `1790360041472`. `SEED_MAX_DOCS` optionally sets a non-negative global maximum across all POC collections. `SEED_COLLECTION_CAPS` optionally supplies a JSON object containing independent non-negative per-collection caps. Collections are allocated in data-model order and the total never exceeds `SEED_MAX_DOCS`.

The script drops and recreates only these POC collections: `tenants`, `documents`, `chunk_profiles`, `chunks`, `queries`, `benchmark_runs`, and `query_results`. It generates deterministic values and ObjectIds, valid declared references, recursive embedded objects and arrays, and all declared plus relationship-derived ordinary indexes. On success it emits exactly one final JSON line containing `seed_summary`.

## Deterministic defaults

- Deterministic seed: `42`.
- Default seed count: `20` for each of the seven collections (140 documents total before caps).
- Relationship indexes were derived for every collection as returned by the data-model input; duplicate key patterns are created only once.
- Input defaults returned by the runtime:
  - `tenants`: derived relationship indexes; seed count 20
  - `documents`: derived relationship indexes; seed count 20
  - `chunk_profiles`: derived relationship indexes; seed count 20
  - `chunks`: derived relationship indexes; seed count 20
  - `queries`: derived relationship indexes; seed count 20
  - `benchmark_runs`: derived relationship indexes; seed count 20
  - `query_results`: derived relationship indexes; seed count 20
