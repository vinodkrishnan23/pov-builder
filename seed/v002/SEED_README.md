# Deterministic MongoDB seed v002

This repair bundle deterministically recreates the `support_teams`, `tickets`, and `dashboard_metric_snapshots` POC collections. It targets Node.js 20 and uses only the official MongoDB driver.

## Run

Set `MONGODB_URI`, then run `npm run seed`. `DB_NAME` defaults to `1790241012873` when omitted.

Optional controls:

- `SEED_MAX_DOCS`: non-negative maximum number of documents in each collection; default 20.
- `SEED_COLLECTION_CAPS`: JSON object containing independent non-negative per-collection caps. Every resulting count is also bounded by `SEED_MAX_DOCS` and the declared default of 20.
- `SEED_SKIP_SEARCH_INDEXES=1`: skips Atlas Vector Search index creation when it is managed by the validator or another external workflow.

The script drops and recreates only the three POC collections. It deterministically generates ObjectIds, dates, scalar values, recursive embedded documents, arrays of embedded documents, references, and fixed eight-dimensional vectors. It creates all declared ordinary indexes. MongoDB creates each `_id` index with its collection. The compound unique metric index additionally makes the two declared `$merge` patterns executable. The script does not pre-execute `$merge` or write query patterns.

The Atlas Vector Search index is named `ticket_embedding_vector`. It uses a valid `vectorSearch` definition with the `embedding` path as an eight-dimensional cosine vector and `status` as a filter field.

## Deterministic defaults returned by the input tools

- support_teams: seed count 20
- tickets: seed count 20
- dashboard_metric_snapshots: seed count 20
- QP-2: synthetic vector dimensions 8
- support_teams: derived query index `_id`
- tickets: derived query index `triage_suggestion.suggested_team_id`
- dashboard_metric_snapshots: derived query indexes `bucket_start`, `metric_type`, `priority`, `product_line`, `time_granularity`, and `team_id`
- tickets: derived query indexes `created_at`, `assigned_team_id`, `resolution_time_minutes`, `resolved_at`, and `status`
