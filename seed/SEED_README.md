# Support Dataset Seeder

## Purpose
This seed application populates MongoDB Atlas with a synthetic internal support dataset for a POV focused on:
- ticket triage suggestions
- similar-ticket retrieval
- dashboard analytics

It creates these collections:
- `support_tickets`
- `support_teams`
- `dashboard_metric_snapshots`

## Environment variables used
- `MONGODB_URI`
- `MONGODB_DB`
- `DATASET_SIZE`
- `RANDOM_SEED`
- `DROP_EXISTING_COLLECTIONS`
- `ATLAS_SEARCH_INDEX_WAIT_MS`
- `CREATE_SEARCH_INDEXES`

## Run
```bash
npm install
node seed.js
```

## Notes
- The dataset is deterministic for a given `RANDOM_SEED`.
- The seeder is safe to rerun: it either drops collections or clears them before repopulating, based on `DROP_EXISTING_COLLECTIONS`.
- It creates standard MongoDB indexes and, optionally, Atlas Search and Vector Search indexes on `support_tickets`.
- Ticket embeddings are synthetic deterministic vectors for demo purposes only.
- All data is fictitious and generated for internal POV/demo use.
