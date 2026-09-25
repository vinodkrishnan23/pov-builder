# Deterministic MongoDB seed v003

This complete repair bundle uses Node.js 20 and the official MongoDB driver. It drops and recreates the POC collections `support_teams`, `tickets`, and `dashboard_metric_snapshots`, then writes deterministic values, dates, ObjectIds, embedded documents, arrays of embedded documents, relationships, and fixed eight-dimensional vectors.

## Run and controls

Set `MONGODB_URI` and run `npm run seed`. `DB_NAME` defaults to `1790241012873`.

- `SEED_MAX_DOCS` is an optional non-negative upper bound for every collection; its default is 20.
- `SEED_COLLECTION_CAPS` is an optional JSON object of independent non-negative per-collection caps. Each result remains bounded by `SEED_MAX_DOCS` and the declared count of 20.
- `SEED_SKIP_SEARCH_INDEXES=1` skips search-index creation when an external validator manages the temporary index.

The script creates all declared ordinary indexes; MongoDB creates the `_id` indexes automatically. The compound unique metric index supports both declared aggregate-merge patterns. Those write patterns are not pre-executed. The Atlas Vector Search index `ticket_embedding_vector` declares `embedding` as an eight-dimensional cosine vector and `status` as a filter.

## Deterministic defaults returned by the input tools

- support_teams: seed count 20
- tickets: seed count 20
- dashboard_metric_snapshots: seed count 20
- QP-2: synthetic vector dimensions 8
- support_teams: derived query index `_id`
- tickets: derived query index `triage_suggestion.suggested_team_id`
- dashboard_metric_snapshots: derived query indexes `bucket_start`, `metric_type`, `priority`, `product_line`, `time_granularity`, and `team_id`
- tickets: derived query indexes `created_at`, `assigned_team_id`, `resolution_time_minutes`, `resolved_at`, and `status`
