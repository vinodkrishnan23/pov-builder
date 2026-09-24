# Support Ticket POV Seeder

## Requirements
- Node.js 18+
- Access to a MongoDB Atlas cluster/database

## Install
```bash
npm install
```

## Run
```bash
node seed.js
```

## Environment variables used
- `MONGODB_URI`
- `MONGODB_DB`
- `DATASET_SIZE` (`small`, `medium`, `large`)
- `RANDOM_SEED`
- `DROP_EXISTING_COLLECTIONS` (`true` or `false`)
- `ATLAS_SEARCH_INDEX_WAIT_MS`
- `CREATE_SEARCH_INDEXES` (`true` or `false`)

## Notes
- `large` seeds about 80,000 tickets.
- The seeder is deterministic for a given `RANDOM_SEED`.
- If `DROP_EXISTING_COLLECTIONS=true`, the script drops and recreates the seeded collections before loading data.
- Atlas Search / Vector Search indexes are only created when `CREATE_SEARCH_INDEXES=true`.
