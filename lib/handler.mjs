// Shared request handler for "Ask the Playbook".
// Used by both the local dev server (server.mjs) and the Vercel function (api/ask.js).
//
// Streams Server-Sent Events to the client:
//   { type: "status", text }   — progress (e.g. searching the web)
//   { type: "text",   text }   — a chunk of the answer
//   { type: "sources", sources:[{url,title}] }
//   { type: "error",  message }
//   { type: "done" }

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";

// Load the playbook copy as the agent's grounding context.
const playbook = JSON.parse(
  readFileSync(path.join(process.cwd(), "content.json"), "utf-8"),
);

const SYSTEM = `You are "The Playbook" — an AI strategy advisor embedded in a living strategic playbook for capturing new business streams and building durable competitive advantage.

You answer the user's questions by grounding your advice in THE PLAYBOOK below, and by using the web_search tool whenever current facts, examples, market data, or recent developments would make your answer more useful or accurate. Prefer the playbook's frameworks and language; reach for the web for anything time-sensitive, company-specific, or factual that isn't in the playbook.

Guidelines:
- Be direct, specific, and actionable — like a sharp operator, not a textbook. Short paragraphs, concrete steps, and the occasional crisp list.
- When a question maps to a playbook section, lead with that framework, then add web-sourced specifics.
- If the user asks something entirely unrelated to business strategy, answer briefly and steer back to what the playbook is for.
- Cite sources naturally when you used the web. Never invent facts or URLs.
- Keep answers tight: usually 2–5 short paragraphs unless the user asks for depth.

THE PLAYBOOK (your primary source of truth):
${JSON.stringify(playbook, null, 2)}`;

function sseWriter(res) {
  return (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {
      /* connection closed */
    }
  };
}

export async function handleAsk(body, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = sseWriter(res);

  if (!process.env.ANTHROPIC_API_KEY) {
    send({
      type: "error",
      message:
        "The server is missing its ANTHROPIC_API_KEY. Add it to your environment (see .env.example) and restart.",
    });
    res.end();
    return;
  }

  const question = (body?.question || "").toString().trim();
  if (!question) {
    send({ type: "error", message: "Please enter a question." });
    res.end();
    return;
  }

  // Prior turns from the client, sanitized to text-only user/assistant turns.
  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .slice(-10)
    : [];

  const client = new Anthropic();
  const messages = [...history, { role: "user", content: question }];

  try {
    let guard = 0;
    while (guard++ < 6) {
      const stream = client.messages.stream({
        model: "claude-opus-4-8",
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages,
      });

      for await (const ev of stream) {
        if (
          ev.type === "content_block_start" &&
          ev.content_block?.type === "server_tool_use" &&
          ev.content_block?.name === "web_search"
        ) {
          send({ type: "status", text: "Searching the web…" });
        } else if (
          ev.type === "content_block_delta" &&
          ev.delta?.type === "text_delta"
        ) {
          send({ type: "text", text: ev.delta.text });
        }
      }

      const final = await stream.finalMessage();

      // Server-side tool loop hit its iteration cap — continue the turn.
      if (final.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: final.content });
        continue;
      }

      // Collect web-search citations from the final answer.
      const seen = new Set();
      const sources = [];
      for (const block of final.content) {
        if (block.type === "text" && Array.isArray(block.citations)) {
          for (const c of block.citations) {
            if (c?.url && !seen.has(c.url)) {
              seen.add(c.url);
              sources.push({ url: c.url, title: c.title || c.url });
            }
          }
        }
      }
      if (sources.length) send({ type: "sources", sources });
      break;
    }

    send({ type: "done" });
    res.end();
  } catch (err) {
    const message =
      err?.error?.error?.message ||
      err?.message ||
      "Something went wrong while answering. Please try again.";
    send({ type: "error", message });
    res.end();
  }
}
