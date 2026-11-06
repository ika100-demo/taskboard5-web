import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskBoard } from "@/app/_components/task-board";
import { addTask } from "@/app/_lib/tasks/actions";

vi.mock("@/app/_lib/tasks/actions", () => ({ addTask: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("board in the load-error state", () => {
  it("refreshes after an add and then shows the refreshed list", async () => {
    const task = { id: "1", title: "Buy milk", due_date: null };
    vi.mocked(addTask).mockResolvedValue({ ok: true, task });
    const { rerender } = render(<TaskBoard initial={{ ok: false }} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add task" });
    fireEvent.change(within(form).getByLabelText("Title"), { target: { value: "Buy milk" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(<TaskBoard initial={{ ok: true, tasks: [task] }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });
});
