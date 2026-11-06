---
spec_id: 001-task-board-page-that-lists-tasks-and
title: Task board page that lists tasks and adds a task through the web server
status: approved
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard5-gitops:001-persistent-tasks-and-web-task-board
---

# 001 — Task board page that lists tasks and adds a task through the web server

## Problem

The taskboard5 Task API can create and list tasks, but it holds them in memory: every restart or redeploy empties the list, and the API must run as exactly one instance. The taskboard5 website shows only a starter page, so nobody can see or add tasks without calling the API by hand. Tasks need to survive restarts and people need a page where they can read the board and add to it; only then is the system usable as a task board.

## System context

Slice of the system plan `001-persistent-tasks-and-web-task-board` in `ika100-demo/taskboard5-gitops` for `taskboard5-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.3** Given tasks exist, when a person opens the web app's root URL, then the task board lists every task in creation order (oldest first), each showing its title exactly as entered and its due date as `YYYY-MM-DD`, or "No due date" when it has none.
- **AC-001.4** Given no task exists, when a person opens the web app's root URL, then the board shows the text "No tasks yet" and the form for adding a task.
- **AC-001.5** Given the board is open, when a person enters the title "Buy milk", optionally picks a due date, and submits the form, then the new task appears at the end of the board without a manual page reload, the form is cleared, and the task is returned by `GET /tasks` and is still on the board after a page reload.
- **AC-001.6** Given the board is open, when a person submits the form with an empty or whitespace-only title or a title longer than 200 characters, then the form shows "Title is required" or "Title must be at most 200 characters" next to the title, keeps the entered values, and no task is created.
- **AC-001.7** Given the Task API is unreachable or answers with an error, when a person opens the board, then the page still loads and shows "Tasks could not be loaded. Please try again later." instead of the list.
- **AC-001.8** Given the Task API is unreachable or answers with an unexpected error, when a person submits a valid task, then the form shows "The task could not be saved. Please try again.", keeps the entered values, and the board does not show the task.
- **AC-001.10** Given a person opens the board and adds a task, when the browser's network requests are inspected, then none of them goes to the Task API: the browser only talks to the web app, which calls the Task API from its server.

### Contract

The only cross-repo calls are from the taskboard5-web **server** to the Task API. The browser talks only to
taskboard5-web. Base URL: env var `API_URL` on the web server (dev: `http://taskboard5-api`, no trailing slash).
All bodies are JSON (`Content-Type: application/json`), UTF-8.

**Task object**

| field | type | notes |
|---|---|---|
| `id` | string | server-assigned UUID |
| `title` | string | 1 to 200 characters, not only whitespace, stored and returned exactly as sent (no trimming) |
| `due_date` | string or null | calendar date `YYYY-MM-DD`; past dates allowed; `null` when none |

**`GET /tasks`**: no parameters.
- `200` — JSON array of Task objects, every task, oldest first (creation order). `[]` when there is none.
- `503` — `{"detail": "Task storage unavailable"}` when the database cannot be reached.

**`POST /tasks`**: body `{"title": "<string>", "due_date": "<YYYY-MM-DD>" | null}`; `due_date` may be omitted.
The web app sends `due_date: null` when no date is picked.
- `201` — the created Task object. It is durable and visible to `GET /tasks` on every instance once returned.
- `422` — FastAPI's standard validation body `{"detail": [{"loc": ["body", "title"|"due_date"], "msg": ..., "type": ...}, ...]}`; nothing stored.
- `503` — `{"detail": "Task storage unavailable"}`; nothing stored.

**`GET /ready`** (Kubernetes probe, not called by the web app): `200 {"status": "ready"}` when the database answers,
`503 {"status": "not ready"}` otherwise. **`GET /health`**: `200` regardless of the database.

**Web app (browser-facing, same origin):** `GET /` renders the board; the add-task submit goes to a same-origin
endpoint of the web app (Server Action or `/api/...` route; the web repo picks). The board's texts are exactly:
"No tasks yet", "No due date", "Title is required", "Title must be at most 200 characters",
"Tasks could not be loaded. Please try again later.", "The task could not be saved. Please try again."

### Errors

- Task API errors are JSON with a `detail` field: a string for `503`, FastAPI's validation list for `422`.
  Unhandled server errors are `500` with a JSON body; callers must not rely on its content.
- The web server treats `GET /tasks` as successful only on `200` with a JSON array; anything else (`503`, `500`,
  any other status, a non-JSON or malformed body, a connection error, a timeout) shows
  "Tasks could not be loaded. Please try again later." and the page itself still answers `200`.
- The web server treats `POST /tasks` as successful only on `201` with a Task object. A `422` whose `loc` names
  `title` shows the matching title message next to the field (normally prevented by the form's own check);
  every other outcome (`422` on `due_date`, `503`, `500`, any other status, a malformed body, a connection error,
  a timeout) shows "The task could not be saved. Please try again." In every failure case the entered values stay
  and the task is not added to the board. The web app does not retry automatically.
- The web app never forwards Task API error bodies or its URL to the browser.

### Timeouts

- Web server -> `GET /tasks`: 5 seconds total (connect + response). On timeout: the load-error message.
- Web server -> `POST /tasks`: 5 seconds total. On timeout: the save-error message. A create that the API completed
  after the timeout may show up on the next page reload; that is accepted (no idempotency key in this spec).
- Task API -> Postgres: connect timeout 2 seconds, statement timeout 3 seconds, so a request with storage down
  answers `503` within 5 seconds. `/ready` uses the same 2-second connect timeout.
- Task API down or not ready: Kubernetes removes not-ready pods from the Service; when no pod is ready, the web
  server gets a connection error and shows the load or save message. The web app's own `/api/ready` does not
  depend on the Task API, so the board stays up while the API is down.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `API_URL=http://taskboard5-api`

### Notes for this repo

Replace the template starter page at app/page.tsx with the board. Read the Task API base URL from the
server-only env var API_URL (in dev: http://taskboard5-api); for local runs and tests, stub the API
(e.g. a fake HTTP server) rather than calling a real one. /api/ready must not depend on the Task API.

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the Task API's GET /tasks returns tasks, when a person opens /, then the board lists every task in the order the API returned them (oldest first), each title exactly as returned (whitespace kept) and the due date as YYYY-MM-DD, or "No due date" when due_date is null (system AC-001.3)
- **AC-001.2** Given the Task API's GET /tasks returns [], when a person opens /, then the page shows "No tasks yet" and the add-task form with a title field, a date picker for the due date and a submit button (system AC-001.4)
- **AC-001.3** Given the board is open, when a person enters "Buy milk", optionally picks a due date and submits, then the web server sends POST /tasks with {"title": "Buy milk", "due_date": <date or null>}, the task appears at the end of the board without a manual reload, the form is cleared, and the task is still on the board after a reload (system AC-001.5)
- **AC-001.4** Given the board is open, when a person submits an empty or whitespace-only title, then "Title is required" is shown next to the title; with a title longer than 200 characters "Title must be at most 200 characters" is shown; in both cases the entered values stay and no POST /tasks is sent (system AC-001.6)
- **AC-001.5** Given the Task API is unreachable, does not answer within 5 seconds, or answers GET /tasks with anything but 200 and a JSON array, when a person opens /, then the page loads with status 200 and shows "Tasks could not be loaded. Please try again later." instead of the list (system AC-001.7)
- **AC-001.6** Given the Task API is unreachable, does not answer within 5 seconds, or answers POST /tasks with anything but 201 (including 503 and a 422 the form did not predict), when a person submits a valid task, then the form shows "The task could not be saved. Please try again.", keeps the entered values, and the board does not show the task (system AC-001.8)
- **AC-001.7** Given a person opens the board and adds a task, when the browser's network requests are inspected, then every request goes to the web app's own origin and none to the Task API; API_URL is read only on the server and never sent to the browser (system AC-001.10)

## Non-goals

## Open questions

<!-- One bullet per question the user must answer; approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-06 created from the system plan, with its criteria (spec 147)
- 2026-11-06 approved
