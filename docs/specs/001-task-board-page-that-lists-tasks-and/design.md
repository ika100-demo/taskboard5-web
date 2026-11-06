# Design — 001 Task board page that lists tasks and adds a task through the web server

## Decisions

- **Reads in a Server Component, writes through a Server Action.** `app/page.tsx` is an async Server Component that
  calls the Task API on every request (`export const dynamic = "force-dynamic"`, `fetch(..., { cache: "no-store" })`)
  and passes the result to a client component. The add-task submit calls a Server Action, which Next.js sends as a
  same-origin `POST /` (AC-001.7). One server-only module owns every Task API call. ADR:
  [docs/adr/001-server-side-task-api-access.md](../../adr/001-server-side-task-api-access.md).
- **The client appends the created task itself.** On success the action returns the Task object from the API's `201`;
  the board appends it to its local list and clears the form (AC-001.3). No `router.refresh()` or `revalidatePath` on
  the success path: the next reload reads `GET /tasks` anyway.
- **Submit via `onSubmit` + `startTransition`, not `<form action>`.** React 19 resets uncontrolled forms after a form
  action, which would lose the entered values on failure (AC-001.4, AC-001.6). The inputs are controlled
  (`useState`), the handler calls `preventDefault()`, validates, then calls the action in a transition. Only success
  clears the fields.
- **Validation runs twice with one function.** `validateTitle` (pure, no env) runs in the browser before any request
  (so no `POST /tasks` is sent, AC-001.4) and again in the Server Action before it calls the API. Length counts
  Unicode code points (`[...title].length`), matching the API's Python `len`. The title is sent **untrimmed**.
- **422 mapping.** The action never sends a title its own `validateTitle` rejects, so a `422` from the API is by
  definition one "the form did not predict": every `422` (on `title` or `due_date`) yields the save error
  (AC-001.6). The system rule "a 422 whose `loc` names `title` shows the matching title message" is satisfied by the
  pre-check: a title that would draw that 422 gets the matching message without a request.
- **Strict response checking.** `GET /tasks` succeeds only on `200` with a JSON array whose every element is a Task
  (`id` string, `title` string, `due_date` string or `null`); `POST /tasks` only on `201` with a Task. Anything else
  (other status, non-JSON, wrong shape, connection error, `AbortSignal.timeout(5000)` firing, `API_URL` unset) is a
  failure (AC-001.5, AC-001.6). No retries.
- **Dates are strings end to end.** `due_date` is shown exactly as returned (`YYYY-MM-DD`), never parsed into `Date`
  (time-zone shifts). The `<input type="date">` value is already `YYYY-MM-DD`; empty means `null`.
- **`/api/ready` stays as it is**: it does not call the Task API.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks/types.ts` | `Task`, `isTask`, result types | new |
| `app/_lib/tasks/messages.ts` | the six exact UI texts as constants | new |
| `app/_lib/tasks/validation.ts` | `validateTitle(title): TitleError \| null` (pure, client-safe) | new |
| `app/_lib/tasks/api.ts` | server-only Task API client: `listTasks()`, `createTask()`; reads `API_URL`, 5 s timeout, logs failures | new |
| `app/_lib/tasks/actions.ts` | `"use server"`: `addTask(input)` Server Action | new |
| `app/page.tsx` | async Server Component: loads tasks, renders heading + `TaskBoard` | changed (replaces starter page) |
| `app/_components/task-board.tsx` | `"use client"`: list / empty / load-error state, owns the task list state | new |
| `app/_components/add-task-form.tsx` | `"use client"`: controlled form, client validation, calls `addTask` | new |
| `app/globals.css` | board, list and form styles (title `white-space: pre-wrap`) | changed |
| `e2e/support/fake-task-api.mjs` | fake Task API for e2e (stateful, scriptable) | new |
| `playwright.config.ts` | starts the fake and the app with `API_URL` pointing at it | changed |

## Contract

### Upstream (binding, from the system spec)

`GET {API_URL}/tasks` and `POST {API_URL}/tasks` exactly as in spec.md "System context > Contract". `API_URL` has its
trailing `/` stripped before use. Requests send `Accept: application/json`; POST sends
`Content-Type: application/json` and body `{"title": <as entered>, "due_date": "<YYYY-MM-DD>" | null}` (always present,
`null` when no date is picked).

### Server-side module interfaces

```ts
// types.ts
export type Task = { id: string; title: string; due_date: string | null };
export function isTask(v: unknown): v is Task;
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult = { ok: true; task: Task } | { ok: false };

// messages.ts — exact texts
export const NO_TASKS = "No tasks yet";
export const NO_DUE_DATE = "No due date";
export const TITLE_REQUIRED = "Title is required";
export const TITLE_TOO_LONG = "Title must be at most 200 characters";
export const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";
export const SAVE_ERROR = "The task could not be saved. Please try again.";

// validation.ts
export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;
export function validateTitle(title: string): TitleError | null; // trim()==="" -> REQUIRED; [...title].length > 200 -> TOO_LONG

// api.ts (server only; never imported by a "use client" module)
export async function listTasks(): Promise<ListResult>;
export async function createTask(input: { title: string; due_date: string | null }): Promise<CreateResult>;

// actions.ts ("use server")
export type AddTaskResult =
  | { ok: true; task: Task }
  | { ok: false; titleError: TitleError }
  | { ok: false; saveError: typeof SAVE_ERROR };
export async function addTask(input: { title: string; due_date: string | null }): Promise<AddTaskResult>;
```

`addTask`: invalid title -> `{ok:false, titleError}` without a request; `due_date` that is neither `null` nor
`/^\d{4}-\d{2}-\d{2}$/` -> `saveError` without a request; else `createTask`, mapping `ok:false` to `saveError`.

Failure logging (server stdout, one JSON line, never sent to the browser):
`{"level":"error","msg":"task api request failed","op":"list"|"create","reason":"timeout"|"network"|"status"|"body"|"config","status"?:number}`.

### Browser-facing page (what the acceptance tests query)

`GET /` always answers `200` (also when the Task API fails). Structure, by accessible role and name:

| Element | Markup |
|---|---|
| Heading | `<h1>` "Task board" (the single h1; the smoke test relies on an h1) |
| Task list | `<ul aria-label="Tasks">`, one `<li>` per task in API order; inside each: the title in `<span class="task-title">` (text exactly as returned, whitespace kept) and the due date in `<span class="task-due">` ( `YYYY-MM-DD` or "No due date") |
| Empty state | `<p>` "No tasks yet" (no `Tasks` list rendered) |
| Load error | `<p role="alert">` "Tasks could not be loaded. Please try again later." in place of the list and the empty state |
| Form | `<form aria-label="Add task">`, rendered in all three states |
| Title field | `<input type="text" name="title">` labelled "Title"; on a title error `aria-invalid="true"` and `aria-describedby="title-error"` |
| Title error | `<p id="title-error">` with "Title is required" or "Title must be at most 200 characters", directly after the title field |
| Due date field | `<input type="date" name="due_date">` labelled "Due date" |
| Submit | `<button type="submit">` "Add task"; `disabled` while the action is pending |
| Save error | `<p role="alert">` "The task could not be saved. Please try again." inside the form |

Behaviour: an error clears when the next submit starts. On success: the task is appended as the last `<li>`
(the empty state disappears), both fields are cleared, no error is shown. In the load-error state a successful add
calls `router.refresh()` instead of appending (the board has no list to append to). On any failure the field values
stay and the list is unchanged.

The only browser requests are to the app's origin: the document, Next.js assets, and the Server Action
`POST /` (header `Next-Action`). No `NEXT_PUBLIC_*` variable is added; `API_URL` is read only inside `api.ts`.

### Fake Task API for e2e (`e2e/support/fake-task-api.mjs`)

Plain Node `http` server, no dependencies, in-memory state. Listens on `FAKE_TASK_API_PORT`. Implements
`GET /tasks` and `POST /tasks` per the contract (assigns UUIDs, returns `201` Task, `422` FastAPI-style body for a
title that is blank/whitespace-only or longer than 200 code points), plus control endpoints:

- `POST /__fake/reset` body `{"tasks"?: Task[]}` -> `204`; clears state, behaviours and the request log, seeds `tasks`.
- `POST /__fake/behavior` body `{"list"?: B, "create"?: B}` -> `204`, where
  `B = "normal" | "hang" | "close" | {"status": number, "body"?: unknown, "raw"?: string}`
  (`hang`: never answers; `close`: destroys the socket; `raw`: sent verbatim as the body).
- `GET /__fake/requests` -> `200 [{"method": str, "path": str, "body": unknown | null}]` (Task API calls only).

`playwright.config.ts` (local mode only, i.e. without `SMOKE_BASE_URL`) picks a free port for the fake, exports
`FAKE_TASK_API_URL=http://127.0.0.1:<port>` into `process.env` (workers inherit it), starts the fake as the first
`webServer` entry (ready URL `.../tasks`), and starts the app with `API_URL=$FAKE_TASK_API_URL`. Because the fake is
shared state, local runs use `workers: 1`.

Suggested acceptance test locations (so they do not collide with files the coders rewrite):
`tests/task-board*.test.tsx`, `tests/tasks-*.test.ts`, `e2e/task-board.spec.ts`.

## Risks

- `playwright.config.ts` is a skeleton file; a `/platform:update` may overwrite the fake-API wiring. If it does,
  re-apply it or move the wiring to a platform-supported hook (`/issue:report`).
- A create that completes on the API after our 5 s timeout shows the save error but appears on reload; accepted by the
  system spec (no idempotency key).
- Rendering an async Server Component in Vitest: tests render `await HomePage()` with `fetch` stubbed (`vi.stubGlobal`)
  and `API_URL` set via `vi.stubEnv`.
