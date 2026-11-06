import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addTask } from "@/app/_lib/tasks/actions";
import HomePage from "@/app/page";

vi.mock("@/app/_lib/tasks/actions", () => ({ addTask: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const mockAdd = vi.mocked(addTask);

async function openBoard(tasks: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(tasks), { status: 200 })));
  vi.stubEnv("API_URL", "http://api.test");
  render(await HomePage());
  const form = screen.getByRole("form", { name: "Add task" });
  return {
    form,
    title: within(form).getByLabelText("Title") as HTMLInputElement,
    due: within(form).getByLabelText("Due date") as HTMLInputElement,
    submit: within(form).getByRole("button", { name: "Add task" }),
  };
}

beforeEach(() => {
  mockAdd.mockReset();
});

describe("add-task form", () => {
  it("AC-001.3 submits title and date, appends the task, and clears the form", async () => {
    const { title, due, submit } = await openBoard([{ id: "1", title: "First", due_date: null }]);
    mockAdd.mockResolvedValue({ ok: true, task: { id: "2", title: "Buy milk", due_date: "2026-05-06" } });
    fireEvent.change(title, { target: { value: "Buy milk" } });
    fireEvent.change(due, { target: { value: "2026-05-06" } });
    fireEvent.click(submit);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2));
    expect(mockAdd).toHaveBeenCalledWith({ title: "Buy milk", due_date: "2026-05-06" });
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items[1].querySelector(".task-title")?.textContent).toBe("Buy milk");
    expect(items[1].querySelector(".task-due")?.textContent).toBe("2026-05-06");
    expect(title.value).toBe("");
    expect(due.value).toBe("");
  });

  it("AC-001.3 sends due_date null when no date is picked and replaces the empty state", async () => {
    const { title, submit } = await openBoard([]);
    mockAdd.mockResolvedValue({ ok: true, task: { id: "2", title: "Buy milk", due_date: null } });
    fireEvent.change(title, { target: { value: "Buy milk" } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("list", { name: "Tasks" })).toBeInTheDocument());
    expect(mockAdd).toHaveBeenCalledWith({ title: "Buy milk", due_date: null });
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.4 shows 'Title is required' for an empty or whitespace title and sends nothing", async () => {
    const { title, submit } = await openBoard([]);
    fireEvent.click(submit);
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.click(submit);
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(title.value).toBe("   ");
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("AC-001.4 shows the too-long message, keeps values and sends nothing", async () => {
    const { title, due, submit } = await openBoard([]);
    const long = "a".repeat(201);
    fireEvent.change(title, { target: { value: long } });
    fireEvent.change(due, { target: { value: "2026-05-06" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Title must be at most 200 characters")).toBeInTheDocument();
    expect(title.value).toBe(long);
    expect(due.value).toBe("2026-05-06");
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("AC-001.6 shows the save error, keeps values and does not add the task", async () => {
    const { form, title, due, submit } = await openBoard([]);
    mockAdd.mockResolvedValue({ ok: false, saveError: "The task could not be saved. Please try again." });
    fireEvent.change(title, { target: { value: "Buy milk" } });
    fireEvent.change(due, { target: { value: "2026-05-06" } });
    fireEvent.click(submit);
    expect(await within(form).findByRole("alert")).toHaveTextContent("The task could not be saved. Please try again.");
    expect(title.value).toBe("Buy milk");
    expect(due.value).toBe("2026-05-06");
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });
});
