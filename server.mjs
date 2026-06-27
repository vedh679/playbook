// Local dev server: serves the static site AND the /api/ask endpoint,
// so the functional AI works locally exactly as it will on Vercel.
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run dev
//   → http://localhost:8123
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { handleAsk } from "./lib/handler.mjs";

const PORT = process.env.PORT || 8123;
const ROOT = process.cwd();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.url === "/api/ask" && req.method === "POST") {
    const body = await readBody(req);
    await handleAsk(body, res);
    return;
  }

  // Static file serving (no path traversal).
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Playbook running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "⚠  ANTHROPIC_API_KEY is not set — the chat will return an error until you add it.",
    );
  }
});
