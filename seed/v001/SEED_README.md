# Deterministic MongoDB seed bundle (v001)

This bundle seeds the POC collections `customers`, `policies`, `execution_requests`, and `rule_execution_logs` with deterministic values and ObjectIds. It targets Node.js 20 and uses only the official MongoDB driver plus Node's built-in cryptography API.

## Run

Set `MONGODB_URI`, then run `npm install` and `npm run seed`. `DB_NAME` optionally overrides the default database name `1790363790918`.

`SEED_MAX_DOCS` is an optional non-negative integer global ceiling across all POC collections. Its deterministic default is 80. `SEED_COLLECTION_CAPS` is an optional JSON object containing independent non-negative per-collection ceilings, for example `{"customers":5,"policies":8}`. Counts are allocated deterministically in collection order by round-robin and never exceed either a collection's model count/cap or the global maximum.

Each run drops and recreates all four POC collections. The script emits exactly one final success line containing a direct collection-count object under `seed_summary`; failures set a non-zero exit status.

## Deterministic model inputs and defaults

The data model specifies deterministic seed value `42`. The input tool returned these applied defaults:

- `customers`: seed count 20
- `policies`: seed count 20
- `execution_requests`: seed count 20
- `rule_execution_logs`: seed count 20

The data model declares no ordinary indexes, so no additional indexes are created. Relationship metadata is intentionally not used.
