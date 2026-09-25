# Deterministic seed bundle v005

This repair bundle seeds `support_teams`, `tickets`, and `dashboard_metric_snapshots` using Node.js 20 and the official MongoDB driver.

## Run

Set `MONGODB_URI` and optionally `DB_NAME`, `SEED_MAX_DOCS`, `SEED_COLLECTION_CAPS`, and `SEED_SKIP_SEARCH_INDEXES`, then run `npm install` and `npm run seed`.

`DB_NAME` defaults to `1790241012873`. `SEED_MAX_DOCS` is a non-negative per-collection ceiling and defaults to 20. `SEED_COLLECTION_CAPS` is an optional JSON object of independent collection caps, each also bounded by `SEED_MAX_DOCS`. Set `SEED_SKIP_SEARCH_INDEXES=1` to skip Atlas Vector Search index creation.

The script deterministically drops and recreates the three POC collections, documents, relationships, ObjectIds, ordinary indexes, and the fixed eight-dimensional `ticket_embedding_vector` search index. It does not pre-execute write query patterns. The repaired snapshot indexing includes the exact declared non-unique compound index plus a differently ordered unique index over the same fields to support the declared `$merge` operations.

## Deterministic defaults returned by the inputs

### Data model

- `support_teams: seed count 20`
- `tickets: seed count 20`
- `dashboard_metric_snapshots: seed count 20`
- `QP-2: synthetic vector dimensions 8`
- `support_teams: derived query index _id`
- `tickets: derived query index triage_suggestion.suggested_team_id`
- `dashboard_metric_snapshots: derived query index bucket_start`
- `dashboard_metric_snapshots: derived query index metric_type`
- `dashboard_metric_snapshots: derived query index priority`
- `dashboard_metric_snapshots: derived query index product_line`
- `dashboard_metric_snapshots: derived query index time_granularity`
- `dashboard_metric_snapshots: derived query index team_id`
- `tickets: derived query index created_at`
- `tickets: derived query index assigned_team_id`
- `tickets: derived query index resolution_time_minutes`
- `tickets: derived query index resolved_at`
- `tickets: derived query index status`

### Query patterns

- `QP-2: synthetic vector dimensions 8`

MongoDB creates the declared `_id` index intrinsically with each collection.