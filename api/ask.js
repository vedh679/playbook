// Vercel serverless function: POST /api/ask
// Streams the Playbook agent's answer as Server-Sent Events.
import { handleAsk } from "../lib/handler.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  // Vercel parses JSON bodies automatically; fall back to manual parse just in case.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
    } catch {
      body = {};
    }
  }

  await handleAsk(body, res);
}
