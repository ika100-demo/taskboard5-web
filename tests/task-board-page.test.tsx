import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

vi.mock("@/app/_lib/tasks/actions", () => ({ addTask: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function open(response: Response | Error) {
  vi.stubGlobal("fetch", response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response));
  render(await HomePage());
}

describe("task board page", () => {
  it("AC-001.1 lists every task in API order with exact titles and due dates", async () => {
    await open(
      json([
        { id: "1", title: "  spaced  title ", due_date: "2026-03-04" },
        { id: "2", title: "Second", due_date: null },
        { id: "3", title: "Third", due_date: "2026-12-31" },
      ]),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Task board" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].querySelector(".task-title")?.textContent).toBe("  spaced  title ");
    expect(items[0].querySelector(".task-due")?.textContent).toBe("2026-03-04");
    expect(items[1].querySelector(".task-title")?.textContent).toBe("Second");
    expect(items[1].querySelector(".task-due")?.textContent).toBe("No due date");
    expect(items[2].querySelector(".task-title")?.textContent).toBe("Third");
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.2 shows the empty state and the add-task form", async () => {
    await open(json([]));
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add task" });
    expect(within(form).getByLabelText("Title")).toHaveAttribute("type", "text");
    expect(within(form).getByLabelText("Due date")).toHaveAttribute("type", "date");
    expect(within(form).getByRole("button", { name: "Add task" })).toHaveAttribute("type", "submit");
  });

  it.each([
    ["503", () => json({ detail: "Task storage unavailable" }, 503)],
    ["500", () => json([], 500)],
    ["JSON object", () => json({ a: 1 })],
    ["non-JSON", () => new Response("oops", { status: 200 })],
    ["unreachable", () => new TypeError("fetch failed")],
    ["timeout", () => new DOMException("timeout", "TimeoutError")],
  ])("AC-001.5 shows the load error instead of the list when the API answers %s", async (_n, make) => {
    await open(make());
    expect(screen.getByRole("alert")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.5 never leaks the API URL or error body into the markup", async () => {
    await open(json({ detail: "Task storage unavailable" }, 503));
    expect(document.body.innerHTML).not.toContain("api.test");
    expect(document.body.innerHTML).not.toContain("Task storage unavailable");
  });
});
