# Deterministic seed bundle v004

This bundle seeds the MongoDB POC collections `support_teams`, `tickets`, and `dashboard_metric_snapshots` using Node.js 20 and the official MongoDB driver.

## Run

Set `MONGODB_URI` and optionally `DB_NAME`, `SEED_MAX_DOCS`, `SEED_COLLECTION_CAPS`, and `SEED_SKIP_SEARCH_INDEXES`, then run:

```sh
npm install
npm run seed
```

`DB_NAME` defaults to `1790241012873`. `SEED_MAX_DOCS` is a non-negative global ceiling per collection and defaults to 20. `SEED_COLLECTION_CAPS` is an optional JSON object whose recognized collection values independently lower that ceiling. Set `SEED_SKIP_SEARCH_INDEXES=1` to skip creation of the Atlas Vector Search index.

The script drops and recreates only the three POC collections, inserts deterministic documents and ObjectIds, creates all declared query indexes, and creates the eight-dimensional `ticket_embedding_vector` Atlas Vector Search index. The snapshot merge key is unique so the declared `$merge` patterns can execute. The script does not execute write query patterns.

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

The `_id` query index is provided intrinsically by MongoDB when each collection is created.
