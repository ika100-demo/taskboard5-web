---
spec_id: 001-task-board-page-that-lists-tasks-and
shape: web-nextjs
spec_hash: 8a3a3395ad5a
summary: Task board at / that lists tasks and adds one through a Server Action; the Task API is called only from the web server
tasks:
  - id: t1
    title: Server-side task module (types, messages, validation, Task API client, addTask action)
    files: [app/_lib/tasks/types.ts, app/_lib/tasks/messages.ts, app/_lib/tasks/validation.ts, app/_lib/tasks/api.ts, app/_lib/tasks/actions.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Fake Task API for e2e and Playwright wiring
    files: [e2e/support/fake-task-api.mjs, playwright.config.ts]
    covers: [AC-001.3, AC-001.5, AC-001.6, AC-001.7]
    parallel_safe: true
    depends_on: []
  - id: t3
    title: Task board page, board and add-task form components
    files: [app/page.tsx, app/_components/task-board.tsx, app/_components/add-task-form.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7]
    parallel_safe: false
    depends_on: [t1]
---

# Plan — 001 Task board page that lists tasks and adds a task through the web server

Design: [design.md](design.md). ADR: [docs/adr/001-server-side-task-api-access.md](../../adr/001-server-side-task-api-access.md).
Levels: t1, t2 (parallel) -> t3. No gitops change: the system plan already wires `API_URL=http://taskboard5-api`.

## t1 — Server-side task module (types, messages, validation, Task API client, addTask action)

**Files:** app/_lib/tasks/types.ts, app/_lib/tasks/messages.ts, app/_lib/tasks/validation.ts, app/_lib/tasks/api.ts, app/_lib/tasks/actions.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7
**Goal:** everything the page needs from the Task API, behind the interfaces in design.md "Server-side module interfaces": `listTasks`, `createTask`, the `addTask` Server Action, `validateTitle` and the exact UI texts.

**Implementation notes:**
- `types.ts`: `Task`, `isTask` (id string, title string, due_date string or null), `ListResult`, `CreateResult`.
- `messages.ts`: the six texts verbatim from the spec; every UI module imports them from here.
- `validation.ts`: pure, no env, client-safe. `trim() === ""` -> "Title is required"; `[...title].length > 200` -> "Title must be at most 200 characters".
- `api.ts`: reads `process.env.API_URL` at call time (not module load), strips a trailing `/`; unset -> failure with reason `config`. `fetch` with `cache: "no-store"`, `signal: AbortSignal.timeout(5000)`, JSON headers.
- `listTasks`: ok only on `200` + JSON array of valid Tasks, order kept. `createTask`: ok only on `201` + valid Task; body always includes `due_date` (`null` when none); title sent untrimmed.
- Every failure (timeout, network, status, body, config) logs one structured JSON line to stderr as in design.md and returns `{ ok: false }`; never throws, never returns API bodies or the URL.
- `actions.ts` (`"use server"`): `addTask` re-validates the title and the `due_date` format before calling `createTask`; maps any `createTask` failure (including every `422`) to `{ ok: false, saveError }`. No retries.
- `docs/env-vars.md`: add `API_URL` (no default, server-only, dev value `http://taskboard5-api`, never `NEXT_PUBLIC_`).

**Done when:** the unit-level acceptance tests for list/create outcomes (200/201 success, 503, 500, other status, malformed body, connection error, timeout, 422) and title validation pass; `devbox run quality` is clean.

## t2 — Fake Task API for e2e and Playwright wiring

**Files:** e2e/support/fake-task-api.mjs, playwright.config.ts
**Covers:** AC-001.3, AC-001.5, AC-001.6, AC-001.7
**Goal:** e2e runs the real app against a scriptable fake Task API, never a real one, exactly as specified in design.md "Fake Task API for e2e".

**Implementation notes:**
- Dependency-free Node `http` server on `FAKE_TASK_API_PORT`; in-memory tasks; `GET/POST /tasks` per contract (UUIDs via `crypto.randomUUID`, FastAPI-style `422` on invalid title).
- Control endpoints `POST /__fake/reset`, `POST /__fake/behavior` (`normal`, `hang`, `close`, `{status, body?, raw?}` for `list` and `create`), `GET /__fake/requests`.
- `playwright.config.ts`, local mode only (no `SMOKE_BASE_URL`): pick a free port for the fake the same way as `E2E_PORT` (only if `FAKE_TASK_API_PORT` is unset), set `process.env.FAKE_TASK_API_URL`, make `webServer` an array: the fake first (ready on `/tasks`), then the app with `env: { API_URL: FAKE_TASK_API_URL }`; set `workers: 1`.
- Smoke mode stays unchanged (no fake, no `webServer`).

**Done when:** `devbox run e2e` starts both servers and the existing `e2e/home.spec.ts` tests that do not depend on the starter page content still pass; the fake answers the control endpoints as specified.

## t3 — Task board page, board and add-task form components

**Files:** app/page.tsx, app/_components/task-board.tsx, app/_components/add-task-form.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7
**Goal:** replace the starter page with the board, matching the markup table in design.md "Browser-facing page" exactly.

**Implementation notes:**
- `app/page.tsx`: async Server Component, `export const dynamic = "force-dynamic"`; calls `listTasks()`; renders `<h1>Task board</h1>` and `<TaskBoard initial={result} />`. Always renders (never throws), so `/` answers `200` on API failure.
- `task-board.tsx` (`"use client"`): state = tasks list or load-error; renders the `Tasks` list, the "No tasks yet" empty state or the load-error alert, plus `AddTaskForm`. `onAdded(task)` appends; in load-error state it calls `router.refresh()` instead.
- `add-task-form.tsx` (`"use client"`): controlled title and date inputs; `onSubmit` with `preventDefault`, runs `validateTitle` first (no action call when invalid), then `addTask` inside `startTransition`; clears both fields only on `ok: true`; shows the title error (with `aria-invalid`/`aria-describedby`) or the save alert; button disabled while pending. Must not import `api.ts`.
- `globals.css`: list/form styles using the existing tokens; `.task-title { white-space: pre-wrap; }`; no horizontal overflow at 375 px.
- `tests/page.test.tsx`: remove the starter-page assertions (the acceptance tests cover the new page); keep it only if it holds a non-acceptance check of the new page.
- `e2e/home.spec.ts`: change the landmark test's h1 to "Task board"; replace the "Check health" link test with a plain `/api/health` request; keep the 404 and phone-width tests.

**Done when:** all acceptance tests for AC-001.1 to AC-001.7 pass (unit and e2e), `devbox run ci` is green including the 80% coverage gate, and `e2e/smoke.spec.ts` still finds an h1.
