# Northwind Support Ticket Triage Seeder

This seed app populates MongoDB Atlas for the `northwind_support_ticket_triage` POV.

## What it creates
- `support_teams`
- `support_tickets`

## Dataset sizing
The script reads `DATASET_SIZE` and creates:
- `small` => 50,000 tickets
- `medium` => 65,000 tickets
- `large` => 80,000 tickets

Resolved vs unresolved mix is approximately 88% resolved and 12% new/open.

## Environment variables
The script reads only these variables:
- `MONGODB_URI`
- `MONGODB_DB`
- `DATASET_SIZE`
- `RANDOM_SEED`
- `DROP_EXISTING_COLLECTIONS`
- `ATLAS_SEARCH_INDEX_WAIT_MS`
- `CREATE_SEARCH_INDEXES`

## Install
```bash
npm install
```

## Run
```bash
node seed.js
```

## Idempotency
- If `DROP_EXISTING_COLLECTIONS=true`, the script drops `support_tickets` and `support_teams` before recreating them.
- In all cases, it clears and repopulates both collections so reruns do not accumulate duplicates.
- Unique indexes on `ticket_id`, `team_code`, and `name` prevent duplicate business keys.

## Atlas Search and Vector Search
If `CREATE_SEARCH_INDEXES=true`, the script attempts to create:
- `ticket_text_search`
- `ticket_similarity_vector`

It then waits for `ATLAS_SEARCH_INDEX_WAIT_MS` milliseconds.

## Synthetic data notes
- All data is synthetic and deterministic based on `RANDOM_SEED`.
- No real customer PII is generated.
- Tickets span roughly 18 months for historical reporting and dashboard trends.
- Repeated issue themes, near-duplicates, and ambiguous cases are intentionally included for similarity retrieval and triage evaluation demos.
