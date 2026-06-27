# The Playbook

An **agentic, AI-first strategy playbook**. Visitors ask it anything; a connected Claude agent answers by grounding its advice in the playbook's frameworks ([content.json](content.json)) and searching the live web when current facts would help.

- **Front end** — a single static page ([index.html](index.html)): a full-screen, modern AI chat experience (rounded surfaces, a soft animated background glow, streaming answers) — the chat *is* the landing page.
- **Back end** — one serverless function ([api/ask.js](api/ask.js)) that calls the Claude API (`claude-opus-4-8`, adaptive thinking) with the server-side **web search** tool and streams the answer back as Server-Sent Events. Core logic lives in [lib/handler.mjs](lib/handler.mjs) and is shared with the local dev server.

## Run locally

```bash
npm install
cp .env.example .env        # then paste your real key into .env
export ANTHROPIC_API_KEY=sk-ant-...   # or use a tool that loads .env
npm run dev                 # http://localhost:8123
```

Get a key at https://console.anthropic.com/settings/keys. Without a key the site still loads and the chat returns a clear "missing API key" message.

## Deploy (Vercel)

1. Push this repo to GitHub and import it into Vercel (no build step — static site + a function).
2. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
3. Deploy. The static site is served from the root and `POST /api/ask` runs the agent.

## Editing the content

[content.json](content.json) is the playbook the agent reasons from — its grounding context. Edit it and the AI's knowledge updates with no code changes.
