import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// SMOKE_BASE_URL points the tests at a running deployment (devbox run smoke); without it they start the app locally.
const smokeBaseUrl = process.env.SMOKE_BASE_URL;

// The local app runs on E2E_PORT, else PORT, else a free port, so a busy 3000 does not break the tests.
// Playwright loads this file again in every worker: the chosen port goes into the environment the workers inherit.
function freePort(): string {
  const script = "const s=require('node:net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  return execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim();
}
if (!smokeBaseUrl && !process.env.E2E_PORT) process.env.E2E_PORT = process.env.PORT || freePort();
const port = process.env.E2E_PORT;

// The local app talks to a scriptable fake Task API, never a real one.
if (!smokeBaseUrl && !process.env.FAKE_TASK_API_PORT) process.env.FAKE_TASK_API_PORT = freePort();
const fakePort = process.env.FAKE_TASK_API_PORT;
if (!smokeBaseUrl) process.env.FAKE_TASK_API_URL = `http://127.0.0.1:${fakePort}`;
const fakeUrl = process.env.FAKE_TASK_API_URL;

export default defineConfig({
  testDir: "./e2e",
  ...(smokeBaseUrl
    ? {}
    : {
        // The fake is shared state, so tests run serially.
        workers: 1,
        webServer: [
          {
            command: "node e2e/support/fake-task-api.mjs",
            url: `${fakeUrl}/tasks`,
            env: { FAKE_TASK_API_PORT: String(fakePort) },
            reuseExistingServer: false,
            timeout: 30_000,
          },
          {
            command: `pnpm build && pnpm exec next start --port ${port}`,
            url: `http://localhost:${port}/api/health`,
            env: { API_URL: String(fakeUrl) },
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
  use: { baseURL: smokeBaseUrl || `http://localhost:${port}` },
});
