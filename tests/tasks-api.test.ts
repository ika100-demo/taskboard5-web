import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addTask } from "@/app/_lib/tasks/actions";
import { createTask, listTasks } from "@/app/_lib/tasks/api";
import { LOAD_ERROR, NO_DUE_DATE, NO_TASKS, SAVE_ERROR, TITLE_REQUIRED, TITLE_TOO_LONG } from "@/app/_lib/tasks/messages";
import { validateTitle } from "@/app/_lib/tasks/validation";

const task = { id: "11111111-1111-4111-8111-111111111111", title: " Buy milk ", due_date: "2026-01-02" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api.test/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("messages and validation", () => {
  it("AC-001.4 exposes the exact message texts", () => {
    expect(TITLE_REQUIRED).toBe("Title is required");
    expect(TITLE_TOO_LONG).toBe("Title must be at most 200 characters");
    expect(LOAD_ERROR).toBe("Tasks could not be loaded. Please try again later.");
    expect(SAVE_ERROR).toBe("The task could not be saved. Please try again.");
    expect(NO_TASKS).toBe("No tasks yet");
    expect(NO_DUE_DATE).toBe("No due date");
  });

  it("AC-001.4 rejects empty and whitespace-only titles and titles over 200 characters", () => {
    expect(validateTitle("")).toBe(TITLE_REQUIRED);
    expect(validateTitle("   \t")).toBe(TITLE_REQUIRED);
    expect(validateTitle("a".repeat(201))).toBe(TITLE_TOO_LONG);
    expect(validateTitle("a".repeat(200))).toBeNull();
    expect(validateTitle("😀".repeat(200))).toBeNull();
    expect(validateTitle(" Buy milk ")).toBeNull();
  });
});

describe("listTasks", () => {
  it("AC-001.1 returns tasks in API order, untouched, via GET {API_URL}/tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([task, { ...task, id: "2", title: "x", due_date: null }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listTasks();
    expect(result).toEqual({ ok: true, tasks: [task, { ...task, id: "2", title: "x", due_date: null }] });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test/tasks");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["503", () => json({ detail: "Task storage unavailable" }, 503)],
    ["500", () => json([], 500)],
    ["201", () => json([], 201)],
    ["object body", () => json({ tasks: [] })],
    ["malformed array item", () => json([{ id: 1 }])],
    ["non-JSON", () => new Response("<html>", { status: 200 })],
  ])("AC-001.5 reports failure for %s", async (_n, make) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make()));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.5 reports failure when the API is unreachable or times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await listTasks()).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.5 reports failure when API_URL is unset", async () => {
    vi.stubEnv("API_URL", "");
    vi.stubGlobal("fetch", vi.fn());
    expect(await listTasks()).toEqual({ ok: false });
  });
});

describe("createTask and addTask", () => {
  it("AC-001.3 sends POST /tasks with the untrimmed title and due_date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(task, 201));
    vi.stubGlobal("fetch", fetchMock);
    const result = await addTask({ title: " Buy milk ", due_date: "2026-01-02" });
    expect(result).toEqual({ ok: true, task });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: " Buy milk ", due_date: "2026-01-02" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.3 sends due_date null when no date is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...task, due_date: null }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await addTask({ title: "Buy milk", due_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.4 returns the title error and sends no request for invalid titles", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await addTask({ title: "  ", due_date: null })).toEqual({ ok: false, titleError: TITLE_REQUIRED });
    expect(await addTask({ title: "a".repeat(201), due_date: null })).toEqual({ ok: false, titleError: TITLE_TOO_LONG });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["503", () => json({ detail: "Task storage unavailable" }, 503)],
    ["unpredicted 422", () => json({ detail: [{ loc: ["body", "due_date"], msg: "bad", type: "x" }] }, 422)],
    ["500", () => json({}, 500)],
    ["200 instead of 201", () => json(task, 200)],
    ["malformed 201", () => json({ nope: true }, 201)],
  ])("AC-001.6 returns the save error for %s", async (_n, make) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make()));
    expect(await addTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false, saveError: SAVE_ERROR });
  });

  it("AC-001.6 returns the save error when the API is unreachable or times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await addTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false, saveError: SAVE_ERROR });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
  });

  it("AC-001.6 returns the save error for a malformed due_date without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await addTask({ title: "Buy milk", due_date: "tomorrow" })).toEqual({ ok: false, saveError: SAVE_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
