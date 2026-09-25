# Deterministic MongoDB seed v001

This bundle recreates the `support_teams`, `tickets`, and `dashboard_metric_snapshots` collections and loads deterministic POC data. It uses Node.js 20 and the official MongoDB driver.

## Run

Set `MONGODB_URI` and optionally `DB_NAME`, `SEED_MAX_DOCS`, `SEED_COLLECTION_CAPS`, and `SEED_SKIP_SEARCH_INDEXES`, then run `npm run seed`.

`SEED_MAX_DOCS` is a non-negative per-collection upper bound. `SEED_COLLECTION_CAPS` is an optional JSON object whose collection-specific non-negative bounds are applied independently and are also bounded by `SEED_MAX_DOCS`. Set `SEED_SKIP_SEARCH_INDEXES=1` when Atlas Search index creation is managed externally.

The seed drops and recreates only the three POC collections. ObjectIds, dates, scalar values, embedded documents, arrays of embedded documents, relationships, and eight-dimensional vectors are deterministic. The aggregate-merge and insert-style query patterns are not pre-executed. The compound unique metric key supports validator execution of both `$merge` patterns.

## Deterministic defaults returned by the specification tools

- support_teams: seed count 20
- tickets: seed count 20
- dashboard_metric_snapshots: seed count 20
- QP-2: synthetic vector dimensions 8
- support_teams: derived query index `_id`
- tickets: derived query index `triage_suggestion.suggested_team_id`
- dashboard_metric_snapshots: derived query indexes `bucket_start`, `metric_type`, `priority`, `product_line`, `time_granularity`, and `team_id`
- tickets: derived query indexes `created_at`, `assigned_team_id`, `resolution_time_minutes`, `resolved_at`, and `status`

The `_id` index is created automatically by MongoDB when each collection is recreated. All other declared ordinary indexes are created explicitly. The Atlas Vector Search index is named `ticket_embedding_vector`, uses path `embedding`, cosine similarity, and 8 dimensions, with `status` available for filtering.
