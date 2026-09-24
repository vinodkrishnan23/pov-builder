# Northwind Support Ticket Triage POV Frontend

## Run

```bash
npm install
npm run dev
```

## Environment

- `VITE_API_BASE_URL` - backend base URL
- `PORT` - port for the dev server

## Routes

- `/` redirects to `/tickets`
- `/tickets` ticket queue
- `/tickets/:ticketId` ticket triage workspace
- `/dashboard` support operations dashboard
