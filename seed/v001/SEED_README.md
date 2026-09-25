# Deterministic MongoDB seed (v001)

This bundle seeds the POC collections with the official MongoDB Node.js driver on Node.js 20. Run `npm install` and then `npm run seed`.

## Environment

- `MONGODB_URI` is required.
- `DB_NAME` is optional and defaults to `1790363790918`.
- `SEED_MAX_DOCS` is an optional non-negative integer ceiling applied independently to every collection; it defaults to 20.
- `SEED_COLLECTION_CAPS` is an optional JSON object containing independent non-negative integer caps keyed by collection name. Each resulting count is the minimum of the model count, `SEED_MAX_DOCS`, and that collection's cap.

The script deterministically drops and recreates `customers`, `policies`, `execution_requests`, and `rule_execution_logs`. ObjectIds, dates, nested values, arrays, and scalar values are deterministic. The data model declares no ordinary indexes, so there are no index specifications to create.

## Deterministic defaults recorded by the input

- customers: seed count 20
- policies: seed count 20
- execution_requests: seed count 20
- rule_execution_logs: seed count 20

The model also provides deterministic seed value `42`; generated values are fixed directly and do not depend on random state.
