# Deterministic seed bundle (`v001`)

This bundle seeds the seven POC collections with Node.js 20 and the official MongoDB driver. Run it with `npm run seed` after installing dependencies.

## Environment

- `MONGODB_URI` is required.
- `DB_NAME` overrides the runtime database default, `1790364549944`.
- `SEED_MAX_DOCS` is an optional non-negative integer. Its deterministic default is 20, and it caps each collection.
- `SEED_COLLECTION_CAPS` is an optional JSON object whose non-negative integer values independently cap named collections. Every effective count is also bounded by `SEED_MAX_DOCS`.

## Determinism and lifecycle

The data model specifies deterministic seed value `42`. ObjectIds, dates, scalar values, nested documents, and arrays are generated reproducibly. Each POC collection is dropped and recreated before insertion. The model declares no ordinary indexes.

## Input defaults applied

The input tool returned these deterministic defaults:

- customers: seed count 20
- admin_users: seed count 20
- policies: seed count 20
- policy_versions: seed count 20
- execution_requests: seed count 20
- execution_rule_steps: seed count 20
- execution_insights: seed count 20

On success, the script prints exactly one JSON line containing a direct collection-count object under `seed_summary`. On failure, it exits non-zero.
