# Northwind Support Ticket Triage Backend

## Run

1. Install dependencies:
   ```sh
   npm install
   ```
2. Set environment variables:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `PORT`
   - `REQUIRE_AUTH` (read by harness, backend does not enforce auth when false)
   - `AUTH_TOKEN` (not used)
3. Start the server:
   ```sh
   node server.js
   ```

## Test

```sh
npm test
```

## Health check

`GET /health`

## Implemented endpoints

- `GET /api/tickets`
- `GET /api/tickets/:ticketId`
- `GET /api/tickets/:ticketId/similar-resolved`
- `GET /api/dashboard/ticket-volume-by-product-line`
- `GET /api/dashboard/ticket-volume-by-priority`
- `GET /api/dashboard/average-resolution-time-by-team`
- `POST /api/tickets/:ticketId/resolve`

## Error format

All errors return:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```
