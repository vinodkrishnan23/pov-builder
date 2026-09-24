# Northwind Support POV API Backend

## Run

Install dependencies:

```bash
npm install
```

Set the required environment variables:

- `MONGODB_URI`
- `MONGODB_DB`
- `PORT`
- `REQUIRE_AUTH`
- `AUTH_TOKEN`

Start the server:

```bash
node server.js
```

## Test

```bash
npm test
```

## Health

`GET /health`

## Notes

- This backend uses Express and the official MongoDB Node.js driver.
- Authentication is not enforced when `REQUIRE_AUTH=false`.
- A unique index is created on `support_tickets.ticket_id` during startup.
- Similar-ticket retrieval uses MongoDB Atlas Vector Search and expects an index named `support_tickets_text_embedding_index` on `support_tickets.text_embedding`.
- Dashboard endpoints support `raw` and `snapshot` sources per the API contract.
