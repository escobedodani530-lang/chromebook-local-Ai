import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const OLLAMA_URL = "http://127.0.0.1:11434";
const MODEL = "qwen2.5:0.5b-instruct";
const MIME = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/styles.css": "text/css; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8"
};

function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(value));
}

async function readJson(req, limit = 48 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function health() {
  try {
    const [versionResponse, tagsResponse] = await Promise.all([
      fetch(OLLAMA_URL + "/api/version", { signal: AbortSignal.timeout(4000) }),
      fetch(OLLAMA_URL + "/api/tags", { signal: AbortSignal.timeout(4000) })
    ]);
    if (!versionResponse.ok || !tagsResponse.ok) throw new Error("Ollama API did not respond successfully.");
    const version = await versionResponse.json();
    const tags = await tagsResponse.json();
    const models = Array.isArray(tags.models) ? tags.models : [];
    const installed = models.some((item) => item.name === MODEL || item.model === MODEL);
    return {
      ollamaAvailable: true,
      version: version.version || "available",
      model: MODEL,
      installed,
      modelSizeBytes: models.find((item) => item.name === MODEL || item.model === MODEL)?.size || null
    };
  } catch (error) {
    return {
      ollamaAvailable: false,
      version: null,
      model: MODEL,
      installed: false,
      error: error.message || "Ollama is not running."
    };
  }
}

async function pipeOllama(endpoint, payload, res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(OLLAMA_URL + endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (!res.headersSent) json(res, 503, { error: "Could not contact the local Ollama process: " + (error.message || "connection failed") });
    return;
  }

  if (!upstream.ok) {
    const message = await upstream.text().catch(() => "Ollama request failed.");
    if (!res.headersSent) json(res, upstream.status, { error: message.slice(0, 2000) });
    return;
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-accel-buffering": "no"
  });

  try {
    for await (const chunk of upstream.body) {
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      res.end(JSON.stringify({ error: error.message || "Ollama stream ended unexpectedly.", done: true }) + "\n");
    }
  }
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  if (!Object.hasOwn(MIME, safePath)) {
    json(res, 404, { error: "Not found." });
    return;
  }

  try {
    const content = await readFile(path.join(PUBLIC_DIR, safePath.slice(1)));
    res.writeHead(200, {
      "content-type": MIME[safePath],
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(content);
  } catch {
    json(res, 404, { error: "The requested app file is missing." });
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    json(res, 200, await health());
    return;
  }

  if (req.method === "POST" && pathname === "/api/pull") {
    await pipeOllama("/api/pull", { model: MODEL, stream: true }, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    try {
      const body = await readJson(req);
      if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 18) {
        json(res, 400, { error: "Send between 1 and 18 chat messages." });
        return;
      }
      const messages = [];
      for (const item of body.messages) {
        if (!item || !["system", "user", "assistant"].includes(item.role) || typeof item.content !== "string") {
          json(res, 400, { error: "A chat message has an invalid role or content." });
          return;
        }
        if (item.content.length > 6000) {
          json(res, 400, { error: "A chat message is too long." });
          return;
        }
        messages.push({ role: item.role, content: item.content });
      }
      await pipeOllama("/api/chat", {
        model: MODEL,
        messages,
        stream: true,
        keep_alive: "5m",
        options: {
          num_ctx: 2048,
          num_predict: 160,
          temperature: 0.7,
          top_p: 0.9
        }
      }, res);
    } catch (error) {
      json(res, 400, { error: error.message || "Invalid request." });
    }
    return;
  }

  if (req.method === "GET") {
    await serveStatic(pathname, res);
    return;
  }

  json(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, HOST, () => {
  process.stdout.write("Ollama Chromebook Lab listening on " + HOST + ":" + PORT + "\n");
});
