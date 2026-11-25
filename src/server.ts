import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Laya, type LayaConfig, type Question } from "@receptron/laya";
import { SAMPLE_PRESETS } from "./presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

interface DownloadProgress {
  file: string;
  received: number;
  total: number | null;
}

interface ModelState {
  status: "loading" | "ready" | "error";
  instance: Laya | null;
  modelDir: string | null;
  config: LayaConfig | null;
  loadTimeMs: number | null;
  progress: DownloadProgress | null;
  error: string | null;
}

const modelState: ModelState = {
  status: "loading",
  instance: null,
  modelDir: null,
  config: null,
  loadTimeMs: null,
  progress: null,
  error: null,
};

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new RequestError(413, "Request body exceeds 1 MB limit.");
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    throw new RequestError(400, "Request body must not be empty.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError(400, "Invalid JSON payload.");
  }
}

class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function validateQuestions(input: unknown): Record<string, Question> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestError(400, "'questions' must be a non-empty object mapping question keys to question specs.");
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    throw new RequestError(400, "Provide at least one question.");
  }

  for (const [key, q] of entries) {
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      throw new RequestError(400, `Question '${key}' must be an object.`);
    }
    const spec = q as Record<string, unknown>;
    if (spec.instructions === undefined || (typeof spec.instructions !== "string" && typeof spec.instructions !== "object")) {
      throw new RequestError(400, `Question '${key}' requires 'instructions' (string or object).`);
    }

    if (spec.type === "choice") {
      const validCriteria =
        Array.isArray(spec.criteria)
          ? spec.criteria.length >= 2 && spec.criteria.every((c) => typeof c === "string" && c.trim().length > 0)
          : Boolean(spec.criteria && typeof spec.criteria === "object" && Object.keys(spec.criteria).length >= 2);
      if (!validCriteria) {
        throw new RequestError(400, `Choice question '${key}' needs at least 2 options in 'criteria'.`);
      }
    } else if (spec.type === "score") {
      if (!Array.isArray(spec.criteria) || spec.criteria.length < 2 || !spec.criteria.every((c) => typeof c === "string")) {
        throw new RequestError(400, `Score question '${key}' needs an array of at least 2 string levels in 'criteria'.`);
      }
    } else if (spec.type !== "noul") {
      throw new RequestError(400, `Question '${key}' has unsupported type '${String(spec.type)}'. Expected 'choice', 'score', or 'noul'.`);
    }
  }

  return input as Record<string, Question>;
}

async function handleEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (modelState.status === "loading") {
    sendJson(res, 503, { error: "Model is still loading. Try again in a moment." });
    return;
  }
  if (modelState.status === "error" || !modelState.instance) {
    sendJson(res, 500, { error: modelState.error ?? "Model failed to initialize." });
    return;
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestError(400, "Payload must be a JSON object with 'state' and 'questions'.");
  }

  const { state, questions, confidenceThreshold } = body as {
    state?: unknown;
    questions?: unknown;
    confidenceThreshold?: unknown;
  };

  if (state === undefined || state === null || (typeof state === "string" && state.trim() === "")) {
    throw new RequestError(400, "'state' must be a non-empty string, object, or array.");
  }

  const validatedQuestions = validateQuestions(questions);
  const threshold =
    typeof confidenceThreshold === "number" && confidenceThreshold >= 0 && confidenceThreshold <= 1
      ? confidenceThreshold
      : 0.75;

  const t0 = performance.now();
  let result;
  try {
    result = await modelState.instance.systemOne(state, validatedQuestions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RequestError(400, `Laya inference failed: ${message}`);
  }
  const latencyMs = Number((performance.now() - t0).toFixed(2));

  const gatedQuestions = Object.entries(result.answers)
    .filter(([, ans]) => ans.answer_confidence < threshold)
    .map(([key]) => key);

  sendJson(res, 200, {
    result,
    latencyMs,
    confidenceThreshold: threshold,
    gatedQuestions,
  });
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, safePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function initModel(): Promise<void> {
  const t0 = performance.now();
  try {
    const laya = await Laya.load({
      modelDir: process.env.LAYA_MODEL_DIR,
      subfolder: process.env.LAYA_SUBFOLDER,
      cacheDir: process.env.LAYA_CACHE,
      onProgress: (info) => {
        modelState.progress = info;
        if (info.total) {
          const pct = ((info.received / info.total) * 100).toFixed(0);
          process.stderr.write(`\r[Laya] Downloading ${info.file}: ${pct}%   `);
        }
      },
    });
    if (modelState.progress) process.stderr.write("\n");
    modelState.instance = laya;
    modelState.modelDir = laya.modelDir;
    modelState.config = laya.config;
    modelState.loadTimeMs = Math.round(performance.now() - t0);
    modelState.progress = null;
    modelState.status = "ready";
    console.log(`[Laya] Ready in ${modelState.loadTimeMs} ms (${laya.modelDir})`);
  } catch (err) {
    modelState.status = "error";
    modelState.error = err instanceof Error ? err.message : String(err);
    console.error("[Laya] Initialization failed:", err);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        status: modelState.status,
        modelDir: modelState.modelDir,
        config: modelState.config,
        loadTimeMs: modelState.loadTimeMs,
        progress: modelState.progress,
        error: modelState.error,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/presets") {
      sendJson(res, 200, { presets: SAMPLE_PRESETS });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/evaluate") {
      await handleEvaluate(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    if (err instanceof RequestError) {
      sendJson(res, err.statusCode, { error: err.message });
      return;
    }
    console.error("[Server] Unhandled error:", err);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Server] Laya Decision Studio listening at http://${HOST}:${PORT}`);
  void initModel();
});

async function shutdown(): Promise<void> {
  console.log("\n[Server] Shutting down...");
  server.close();
  if (modelState.instance) {
    await modelState.instance.close();
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
