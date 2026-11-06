import { expect, test, type Page } from "@playwright/test";

const fake = process.env.FAKE_TASK_API_URL ?? "";
const control = (path: string, body: unknown) => fetch(`${fake}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const requests = async (): Promise<{ method: string; path: string; body: unknown }[]> => (await fetch(`${fake}/__fake/requests`)).json();
const reset = async (tasks: unknown[] = []) => {
  expect(fake).not.toBe("");
  expect((await control("/__fake/reset", { tasks })).status).toBe(204);
};
const behave = async (b: unknown) => expect((await control("/__fake/behavior", b)).status).toBe(204);

async function fill(page: Page, title: string, due?: string) {
  const form = page.getByRole("form", { name: "Add task" });
  await form.getByLabel("Title").fill(title);
  if (due) await form.getByLabel("Due date").fill(due);
  await form.getByRole("button", { name: "Add task" }).click();
  return form;
}

test.describe("task board", () => {
  test.skip(!!process.env.SMOKE_BASE_URL, "uses the fake Task API");

  test("AC-001.1 lists the API's tasks in order", async ({ page }) => {
    await reset([
      { id: "00000000-0000-4000-8000-000000000001", title: "One", due_date: "2026-01-01" },
      { id: "00000000-0000-4000-8000-000000000002", title: "Two", due_date: null },
    ]);
    await page.goto("/");
    const items = page.getByRole("list", { name: "Tasks" }).getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("2026-01-01");
    await expect(items.nth(1)).toContainText("No due date");
  });

  test("AC-001.3 adds a task without reload, clears the form and keeps it after reload", async ({ page }) => {
    await reset();
    await page.goto("/");
    await expect(page.getByText("No tasks yet")).toBeVisible();
    const form = await fill(page, "Buy milk", "2026-05-06");
    const items = page.getByRole("list", { name: "Tasks" }).getByRole("listitem");
    await expect(items.last()).toContainText("Buy milk");
    await expect(form.getByLabel("Title")).toHaveValue("");
    await expect(form.getByLabel("Due date")).toHaveValue("");
    const posts = (await requests()).filter((r) => r.method === "POST" && r.path === "/tasks");
    expect(posts.map((p) => p.body)).toEqual([{ title: "Buy milk", due_date: "2026-05-06" }]);
    await page.reload();
    await expect(page.getByRole("list", { name: "Tasks" }).getByRole("listitem").last()).toContainText("Buy milk");
  });

  test("AC-001.3 sends due_date null without a date", async ({ page }) => {
    await reset();
    await page.goto("/");
    await fill(page, "No date");
    await expect(page.getByRole("list", { name: "Tasks" })).toContainText("No due date");
    const posts = (await requests()).filter((r) => r.method === "POST");
    expect(posts.map((p) => p.body)).toEqual([{ title: "No date", due_date: null }]);
  });

  test("AC-001.4 blocks empty and too long titles without a POST", async ({ page }) => {
    await reset();
    await page.goto("/");
    const form = await fill(page, "   ");
    await expect(form.getByText("Title is required")).toBeVisible();
    await form.getByLabel("Title").fill("a".repeat(201));
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(form.getByText("Title must be at most 200 characters")).toBeVisible();
    await expect(form.getByLabel("Title")).toHaveValue("a".repeat(201));
    expect((await requests()).filter((r) => r.method === "POST")).toHaveLength(0);
  });

  for (const [name, behavior] of [
    ["503", { status: 503, body: { detail: "Task storage unavailable" } }],
    ["close", "close"],
    ["malformed", { status: 200, raw: "not json" }],
    ["hang", "hang"],
  ] as const) {
    test(`AC-001.5 shows the load error with status 200 when GET /tasks is ${name}`, async ({ page }) => {
      test.setTimeout(30_000);
      await reset();
      await behave({ list: behavior });
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("alert")).toContainText("Tasks could not be loaded. Please try again later.");
      await expect(page.getByRole("list", { name: "Tasks" })).toHaveCount(0);
    });
  }

  for (const [name, behavior] of [
    ["503", { status: 503, body: { detail: "Task storage unavailable" } }],
    ["unpredicted 422", { status: 422, body: { detail: [{ loc: ["body", "due_date"], msg: "bad", type: "x" }] } }],
    ["close", "close"],
    ["hang", "hang"],
  ] as const) {
    test(`AC-001.6 shows the save error and keeps values when POST /tasks is ${name}`, async ({ page }) => {
      test.setTimeout(30_000);
      await reset();
      await page.goto("/");
      await behave({ create: behavior });
      const form = await fill(page, "Buy milk", "2026-05-06");
      await expect(form.getByRole("alert")).toContainText("The task could not be saved. Please try again.", { timeout: 15_000 });
      await expect(form.getByLabel("Title")).toHaveValue("Buy milk");
      await expect(form.getByLabel("Due date")).toHaveValue("2026-05-06");
      await expect(page.getByRole("list", { name: "Tasks" })).toHaveCount(0);
    });
  }

  test("AC-001.7 only talks to the app's own origin and never leaks API_URL", async ({ page, baseURL }) => {
    await reset();
    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));
    const html: string[] = [];
    page.on("response", async (r) => {
      if (r.request().resourceType() === "document" || r.request().resourceType() === "script") html.push(await r.text().catch(() => ""));
    });
    await page.goto("/");
    await fill(page, "Buy milk");
    await expect(page.getByRole("list", { name: "Tasks" })).toContainText("Buy milk");
    expect(seen.length).toBeGreaterThan(0);
    const origin = new URL(baseURL ?? "").origin;
    for (const url of seen) if (!url.startsWith("data:") && !url.startsWith("blob:")) expect(new URL(url).origin).toBe(origin);
    expect(seen.some((u) => u.startsWith(fake))).toBe(false);
    expect(html.join("\n")).not.toContain(fake);
  });
});
