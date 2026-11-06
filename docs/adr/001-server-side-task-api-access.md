# ADR-001: The browser talks only to the web server; the Task API is called from server-only code

## Status

Accepted (spec 001).

## Context

The taskboard5 system contract (system plan `001-persistent-tasks-and-web-task-board`) requires that the browser never
calls the Task API: the web app reads `API_URL` on its server and calls the API from there (system AC-001.10). Every
later feature that reads or writes tasks faces the same choice: a same-origin `/api/...` route handler, or a React
Server Action, plus where the HTTP client to the Task API lives.

## Decision

- All Task API access goes through one server-side module, `app/_lib/tasks/api.ts`. It is the only code that reads
  `API_URL`, sets the request timeout and turns any API response into a typed `ok`/failure result. No other module
  calls `fetch` against the Task API.
- Reads happen in Server Components (`app/page.tsx` renders the board with the data already in the HTML).
- Writes go through Server Actions (`"use server"` modules under `app/_lib/tasks/`), invoked from client components.
  We do not add `/api/...` route handlers for browser-facing task operations.
- `API_URL` is never prefixed `NEXT_PUBLIC_` and never appears in a response, an error message or the client bundle.
  Task API error bodies are logged server-side (structured JSON) and never forwarded.

## Consequences

- The browser's only requests are to the web app's origin (the page and the Server Action POST), which is what the
  contract requires, without a hand-written JSON API in this repo.
- Server Actions are bound to Next.js; moving to another framework means rewriting the write path. Accepted: the
  platform's web shape is Next.js App Router only (platform ADR-004).
- Unit tests stub `fetch` (or the `api.ts` module); e2e tests run the app against a fake Task API, never a real one.
