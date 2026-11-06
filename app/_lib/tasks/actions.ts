"use server";

import { createTask } from "./api";
import { SAVE_ERROR } from "./messages";
import type { Task } from "./types";
import { validateTitle } from "./validation";
import type { TitleError } from "./validation";

export type AddTaskResult =
  | { ok: true; task: Task }
  | { ok: false; titleError: TitleError }
  | { ok: false; saveError: typeof SAVE_ERROR };

export async function addTask(input: { title: string; due_date: string | null }): Promise<AddTaskResult> {
  const title = typeof input?.title === "string" ? input.title : "";
  const titleError = validateTitle(title);
  if (titleError) return { ok: false, titleError };
  const due = input.due_date;
  if (due !== null && !(typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due))) {
    return { ok: false, saveError: SAVE_ERROR };
  }
  const result = await createTask({ title, due_date: due });
  if (!result.ok) return { ok: false, saveError: SAVE_ERROR };
  return { ok: true, task: result.task };
}
