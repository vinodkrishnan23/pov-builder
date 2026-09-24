# Northwind Support POV Backend

## Run

Install dependencies:

```bash
npm install
```

Start the server:

```bash
node server.js
```

## Environment variables

- `MONGODB_URI`
- `MONGODB_DB` (optional if the DB name is present in `MONGODB_URI`)
- `PORT`
- `REQUIRE_AUTH`
- `AUTH_TOKEN`

## Implemented endpoints

- `GET /health`
- `GET /api/v1/tickets/:ticketNumber`
- `GET /api/v1/tickets/:ticketNumber/triage-suggestion`
- `POST /api/v1/similar-tickets/search`
- `GET /api/v1/dashboard/ticket-volume`
- `GET /api/v1/dashboard/avg-resolution-time`
- `POST /api/v1/admin/dashboard-metrics/ticket-volume/refresh`
- `POST /api/v1/admin/dashboard-metrics/avg-resolution-time/refresh`
- `GET /api/v1/support-teams`
- `PATCH /api/v1/tickets/:ticketNumber/status`

## Notes

- Responses use JSON.
- Authentication is skipped when `REQUIRE_AUTH=false`.
- Dashboard refresh endpoints currently execute synchronously and return `202 Accepted` per contract.
- Similar ticket search uses MongoDB Atlas Vector Search index `ticket_embedding_vector`.

## Tests

Run:

```bash
npm test
```
