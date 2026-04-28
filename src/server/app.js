import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getConfig } from "../config/index.js";
import { getSystemHealth, runRagQuery, runRetrievalOnly } from "../services/rag.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(rawBody);
}

async function serveStaticAsset(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const assetPath = path.normalize(path.join(publicDir, safePath));

  if (!assetPath.startsWith(publicDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(assetPath);
    const extension = path.extname(assetPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }

    throw error;
  }
}

export function createAppServer({
  ragRunner = runRagQuery,
  retrievalRunner = runRetrievalOnly,
  healthProvider = getSystemHealth,
} = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const health = await healthProvider();
        sendJson(response, 200, health);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/retrieve") {
        const body = await readJsonBody(request);
        const result = await retrievalRunner(body || {});
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/ask") {
        const body = await readJsonBody(request);
        const result = await ragRunner(body || {});
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET") {
        await serveStaticAsset(url.pathname, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      const statusCode = error.name === "SyntaxError" ? 400 : 500;
      sendJson(response, statusCode, {
        error: error.message || "Unexpected server error",
      });
    }
  });
}

export function startServer(port = getConfig().port) {
  const server = createAppServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1] === __filename) {
  startServer()
    .then((server) => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : getConfig().port;
      console.log(`RAG Log Assistant running at http://localhost:${actualPort}`);
    })
    .catch((error) => {
      console.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    });
}
