import { isTask } from "./types";
import type { CreateResult, ListResult } from "./types";

type Reason = "timeout" | "network" | "status" | "body" | "config";
type Op = "list" | "create";

function logFailure(op: Op, reason: Reason, status?: number): void {
  const line: Record<string, unknown> = { level: "error", msg: "task api request failed", op, reason };
  if (status !== undefined) line.status = status;
  process.stderr.write(JSON.stringify(line) + "\n");
}

async function call(op: Op, init: RequestInit, expected: number): Promise<unknown | undefined> {
  const base = process.env.API_URL?.replace(/\/$/, "");
  if (!base) {
    logFailure(op, "config");
    return undefined;
  }
  let res: Response;
  try {
    res = await fetch(`${base}/tasks`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    logFailure(op, timeout ? "timeout" : "network");
    return undefined;
  }
  if (res.status !== expected) {
    logFailure(op, "status", res.status);
    return undefined;
  }
  try {
    return await res.json();
  } catch {
    logFailure(op, "body", res.status);
    return undefined;
  }
}

export async function listTasks(): Promise<ListResult> {
  const body = await call("list", { method: "GET", headers: { Accept: "application/json" } }, 200);
  if (body === undefined) return { ok: false };
  if (!Array.isArray(body) || !body.every(isTask)) {
    logFailure("list", "body", 200);
    return { ok: false };
  }
  return { ok: true, tasks: body };
}

export async function createTask(input: { title: string; due_date: string | null }): Promise<CreateResult> {
  const body = await call(
    "create",
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
    },
    201,
  );
  if (body === undefined) return { ok: false };
  if (!isTask(body)) {
    logFailure("create", "body", 201);
    return { ok: false };
  }
  return { ok: true, task: body };
}
