export type Task = { id: string; title: string; due_date: string | null };

export function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.title === "string" && (t.due_date === null || typeof t.due_date === "string");
}

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult = { ok: true; task: Task } | { ok: false };
