// Scriptable fake Task API for e2e. Dependency-free; state lives in memory.
// Task API: GET/POST /tasks. Control: POST /__fake/reset, POST /__fake/behavior, GET /__fake/requests.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.FAKE_TASK_API_PORT);
if (!Number.isInteger(port) || port <= 0) {
  console.error("FAKE_TASK_API_PORT must be set to a port number");
  process.exit(1);
}

let tasks = [];
let behavior = { list: "normal", create: "normal" };
let log = [];
const hung = new Set();

function send(res, status, body, raw) {
  const payload = raw !== undefined ? raw : body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": raw !== undefined ? "text/plain" : "application/json" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Applies a scripted behaviour; returns true when it handled the request.
function scripted(b, req, res) {
  if (b === "hang") {
    hung.add(req.socket);
    return true;
  }
  if (b === "close") {
    req.socket.destroy();
    return true;
  }
  if (b && typeof b === "object") {
    send(res, b.status ?? 200, b.body, typeof b.raw === "string" ? b.raw : undefined);
    return true;
  }
  return false;
}

function invalidTitle(title) {
  const msg = typeof title !== "string" ? "Input should be a valid string" : title.trim() === "" ? "String should have at least 1 character" : [...title].length > 200 ? "String should have at most 200 characters" : null;
  return msg;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const text = await readBody(req);

  if (path === "/__fake/reset" && req.method === "POST") {
    const body = parse(text);
    for (const s of hung) s.destroy();
    hung.clear();
    tasks = Array.isArray(body?.tasks) ? [...body.tasks] : [];
    behavior = { list: "normal", create: "normal" };
    log = [];
    return send(res, 204);
  }
  if (path === "/__fake/behavior" && req.method === "POST") {
    const body = parse(text) ?? {};
    if (body.list !== undefined) behavior.list = body.list;
    if (body.create !== undefined) behavior.create = body.create;
    return send(res, 204);
  }
  if (path === "/__fake/requests" && req.method === "GET") return send(res, 200, log);

  if (path === "/tasks" && (req.method === "GET" || req.method === "POST")) {
    const body = req.method === "POST" ? parse(text) : null;
    log.push({ method: req.method, path, body });
    if (scripted(req.method === "GET" ? behavior.list : behavior.create, req, res)) return;
    if (req.method === "GET") return send(res, 200, tasks);
    const msg = invalidTitle(body?.title);
    if (msg) return send(res, 422, { detail: [{ loc: ["body", "title"], msg, type: "value_error" }] });
    const task = { id: randomUUID(), title: body.title, due_date: body.due_date ?? null };
    tasks.push(task);
    return send(res, 201, task);
  }
  send(res, 404, { detail: "Not Found" });
});

server.listen(port, "127.0.0.1", () => console.log(`fake Task API on ${port}`));
