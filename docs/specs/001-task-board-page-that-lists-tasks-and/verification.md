# Verification — 001 Task board page that lists tasks and adds a task through the web server

**Result:** pass
**Cycle:** 2
**Commit:** acd4ffd · **Base:** 3fa1f77 · **Trace:** 7/7 criteria named by tests

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `tests/task-board-page.test.tsx` "AC-001.1 lists every task in API order with exact titles and due dates"; `tests/tasks-api.test.ts` "AC-001.1 returns tasks in API order, untouched…"; `e2e/task-board.spec.ts` "AC-001.1 lists the API's tasks in order" | `app/_lib/tasks/api.ts:43-51`, `app/_components/task-board.tsx:39-46`, `app/globals.css` `.task-title { white-space: pre-wrap }` | unit test asserts order, whitespace-kept title (`"  spaced  title "`), `YYYY-MM-DD` and "No due date" |
| AC-001.2 | met | `tests/task-board-page.test.tsx` "AC-001.2 shows the empty state and the add-task form" | `app/_components/task-board.tsx:36-37`, `app/_components/add-task-form.tsx:49-73` | asserts "No tasks yet", no list, text input, date input, submit button |
| AC-001.3 | met | `tests/task-board-form.test.tsx` "AC-001.3 submits title and date…", "AC-001.3 sends due_date null…"; `tests/tasks-api.test.ts` "AC-001.3 sends POST /tasks…"; `e2e/task-board.spec.ts` "AC-001.3 adds a task without reload…", "AC-001.3 sends due_date null without a date"; supporting (not an acceptance test) `tests/task-board-refresh.test.tsx` "refreshes after an add and then shows the refreshed list" | `app/_lib/tasks/api.ts:53-69`, `app/_lib/tasks/actions.ts:14-25`, `app/_components/add-task-form.tsx:29-45`, `app/_components/task-board.tsx:14-28` | List and empty states: POST body, append at end, form cleared, survives reload (all asserted, unchanged since cycle 1). Load-error state (cycle-1 gap): fixed in acd4ffd; `task-board.tsx:15-20` keeps the last `initial` seen and, when `router.refresh()` (`:24`) delivers a new `initial`, resets `tasks` from it during render (React derived-state pattern). The new test renders `{ok:false}`, adds, asserts `refresh` was called, rerenders with `{ok:true,tasks:[task]}` and asserts the alert is gone and the list has exactly the new task. `page.tsx` is `force-dynamic` and builds a fresh result object per request, so identity changes on every refresh; in the ok state no refresh is triggered, so appended tasks are not overwritten. If the refreshed load fails again the alert stays: consistent with AC-001.5. |
| AC-001.4 | met | `tests/task-board-form.test.tsx` "AC-001.4 shows 'Title is required'…", "AC-001.4 shows the too-long message…"; `tests/tasks-api.test.ts` "AC-001.4 rejects empty and whitespace-only…", "AC-001.4 returns the title error and sends no request…"; `e2e/task-board.spec.ts` "AC-001.4 blocks empty and too long titles without a POST" | `app/_lib/tasks/validation.ts:5-9`, `app/_components/add-task-form.tsx:24-28,61-65`, `app/_lib/tasks/actions.ts:16-17` | both messages, values kept, zero POSTs to the fake asserted; 200 code points boundary tested |
| AC-001.5 | met | `tests/task-board-page.test.tsx` "AC-001.5 shows the load error…" (503, 500, object, non-JSON, unreachable, timeout), "AC-001.5 never leaks…"; `tests/tasks-api.test.ts` AC-001.5 cases; `e2e/task-board.spec.ts` "AC-001.5 shows the load error with status 200…" (503, close, malformed, hang) | `app/_lib/tasks/api.ts:13-51` (`AbortSignal.timeout(5000)` at :24), `app/page.tsx:6-14`, `app/_components/task-board.tsx:32-35` | e2e asserts `response.status() === 200` and real 5 s hang |
| AC-001.6 | met | `tests/tasks-api.test.ts` "AC-001.6 returns the save error for %s" (503, unpredicted 422, 500, 200, malformed 201), unreachable/timeout, malformed due_date; `tests/task-board-form.test.tsx` "AC-001.6 shows the save error…"; `e2e/task-board.spec.ts` "AC-001.6 shows the save error and keeps values…" (503, 422, close, hang) | `app/_lib/tasks/actions.ts:18-23`, `app/_lib/tasks/api.ts:53-69`, `app/_components/add-task-form.tsx:42-44,74-78` | values kept and no list asserted in unit and e2e |
| AC-001.7 | met | `e2e/task-board.spec.ts` "AC-001.7 only talks to the app's own origin and never leaks API_URL" | `app/_lib/tasks/api.ts:14` (only reader of `API_URL`), `app/_components/add-task-form.tsx:6` (imports the `"use server"` action, not `api.ts`) | every request same-origin, none to the fake, fake URL absent from document and script bodies; no `NEXT_PUBLIC_*` in `app/` |

## Non-goals

The spec lists none. No code beyond the board, the form and the server-side Task API client was added. `app/layout.tsx` (header, footer, navigation) and `app/api/*` (including `/api/ready`) are unchanged.

## Deviations from the plan

- `app/_components/feature-card.tsx`, `app/_components/icons.tsx` deleted, in no task's `files`: acceptable, they were used only by the replaced starter page and nothing imports them.
- `tests/task-board-*.test.tsx`, `tests/tasks-api.test.ts`, `e2e/task-board.spec.ts`: acceptance-test commit 9e72a8b, not coder tasks; acceptable (`cplat spec test-diff`: unchanged).
- `docs/adr/001-server-side-task-api-access.md`: design artefact referenced by design.md; acceptable.
- `app/globals.css` hides `next-route-announcer` (`display: none`): within t3's files, but not a styling change the plan asked for; it exists only because the AC-001.5 e2e test queries `page.getByRole("alert")` page-wide instead of inside the board region (the #478 pattern). Acceptable for now: the app has one route and no client navigation, so the announcer has nothing to announce, and the header/footer/nav are untouched. Follow-up: scope that locator to `main` and drop the CSS rule, so route announcements work if routes are added.
- The form displays a server-returned `titleError` (`add-task-form.tsx:40-41`): acceptable, it is the `AddTaskResult` variant in design.md's contract and matches the system rule that a title problem shows the title message.
- `tests/task-board-refresh.test.tsx` (acd4ffd, task t3): coder-written regression test for the cycle-1 finding, not in t3's `files`; acceptable, it adds coverage and changes no acceptance test (`cplat spec test-diff` vs 9e72a8b: unchanged).
- All tasks t1–t3 have `done: true`.

## Contract

Matches design.md for module interfaces (`types.ts`, `messages.ts`, `validation.ts`, `api.ts`, `actions.ts`), upstream requests (trailing `/` stripped, `Accept` and `Content-Type` headers, `due_date` always present), 5 s timeout, no retries, page markup table and fake Task API control endpoints. One difference remains:

- Failure log goes to stderr (`api.ts:10`); design.md says "server stdout", plan.md t1 says stderr. Acceptable (plan is the later, more specific instruction; both are server-side only).
- design.md "Behaviour": "In the load-error state a successful add calls `router.refresh()`": now met; the call is made (`task-board.tsx:24`) and the board follows the refreshed result (`task-board.tsx:15-20`). Resolved since cycle 1.
