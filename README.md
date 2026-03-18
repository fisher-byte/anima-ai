<p align="center">
  <img src="./src/renderer/public/favicon.svg" alt="Anima logo" width="64" height="64"/>
</p>

<h1 align="center">Anima</h1>

<p align="center">
  <i>The part of you that remembers.</i>
</p>

<p align="center">
  <a href="./README.zh.md">中文</a> · <strong>English</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.23-black" alt="version"/>
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js" alt="node"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="react"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="typescript"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="license"/>
  <a href="https://github.com/fisher-byte/anima-ai"><img src="https://img.shields.io/github/stars/fisher-byte/anima-ai?style=social" alt="stars"/></a>
</p>

<p align="center">
  <b>Live demo: <a href="https://chatanima.com">chatanima.com</a></b>
</p>

---

## What is Anima?

Anima is a **local-first AI canvas** that turns every conversation into a node on an infinite canvas. Nodes connect, cluster, and evolve — building a personal knowledge graph that is entirely yours.

The AI doesn't just answer questions. It learns who you are.

> *In Jungian psychology, the anima is the missing part of the self — the inner world not yet fully grasped by consciousness. In this age, AI is the self. Your memories form you, and through interaction, they transfer to the AI. AI is you — but that part of you should still belong to you.*

---

## Features

| Feature | Description |
|---------|-------------|
| **Conversation → Node** | Every chat auto-generates a card on the infinite canvas |
| **Silent Learning** | Say "be more concise" — next reply adapts automatically |
| **Evolution Log** | Your preferences, thinking style, and focus areas gradually shape the AI's behavior |
| **Personal Knowledge Graph** | Nodes cluster by category, connect by semantic similarity |
| **Node Consolidation** | One-click merge of similar nodes into topic clusters |
| **4 Public Spaces + Custom** | Chat with Lenny, Paul Graham, 张小龙, 王慧文 (authentic voice styles) or create your own Space |
| **File Library** | Upload files to any Space; search and reference with @ |
| **Multimodal Input** | Drag in images, PDFs, Word documents |
| **Memory Import** | Import conversation history from ChatGPT, Claude, Gemini |
| **Multi-tenant** | Each access token maps to a fully isolated SQLite database |
| **Timeline View** | Date-ordered timeline view of all memories |
| **Feedback Button** | In-app bug reports and suggestions, stored locally |
| **OpenAI-compatible** | Works with Kimi, OpenAI, or any compatible endpoint |
| **Shared API Key** | Works out-of-the-box — no API key required; bring your own to increase quota |

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/fisher-byte/anima-ai.git
cd anima-ai
npm install
```

### 2. Configure (optional)

```bash
cp .env.example .env
# Default config works out of the box.
# Set your API key in the UI (Settings → API Key).
```

### 3. Start dev server

```bash
npm run dev
```

Open `http://localhost:5173`. Enter your API key in the top-right Settings panel.

### 4. Production deploy

```bash
npm run build   # Build frontend → dist/
npm start       # Start production server on port 3000
```

**Docker:**

```bash
docker build -t anima .
docker run -p 3000:3000 -v $(pwd)/data:/app/data \
  -e ACCESS_TOKEN=your_secret_token anima
```

**VPS with PM2:**

```bash
npm install -g pm2
PORT=3001 ACCESS_TOKEN=your_token pm2 start "npm start" --name anima
```

See [docs/deployment.md](./docs/deployment.md) for the full guide.

---

## How the learning works

Anima picks up on natural language feedback and adapts:

| You say | What Anima learns |
|---------|------------------|
| "be more concise" / "too long" | Lead with conclusion, bullet key points |
| "don't use that" | Avoid specific approach or framework |
| "try a different angle" | Reorganize the response structure |
| "that's wrong" | Re-understand the requirement before answering |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5, Zustand, Tailwind CSS, Framer Motion |
| Backend | Hono 4 (Node.js), SQLite (better-sqlite3) |
| Build | Vite 5, tsx |
| AI | OpenAI-compatible API (Kimi, OpenAI, local models) |
| Desktop (optional) | Electron 29 |
| Testing | Vitest (522 unit tests), Playwright (E2E) |

---

## Project Structure

```
anima-ai/
├── src/
│   ├── server/          # Hono backend
│   │   ├── index.ts     # Server entry
│   │   ├── db.ts        # DB init & multi-tenant connection pool
│   │   ├── agentWorker.ts   # Background task scheduler
│   │   ├── routes/      # REST routes (storage / config / ai / memory / feedback)
│   │   └── middleware/  # Auth middleware
│   ├── renderer/        # React frontend
│   │   └── src/
│   │       ├── components/  # Canvas, NodeCard, AnswerModal, FeedbackButton…
│   │       ├── stores/      # Zustand state
│   │       ├── services/    # Frontend services
│   │       └── i18n/        # zh / en translations
│   ├── services/        # Pure business logic (feedback, profile, prompt)
│   └── shared/          # Shared types, constants, seed data
├── data/                # User data — auto-created, gitignored
│   └── {userId}/        # Each user gets an isolated anima.db
├── e2e/                 # Playwright E2E tests
└── docs/                # Documentation
```

---

## Data & Privacy

All data lives on your machine. Nothing leaves except the AI API calls you configure:

- **Web mode** (default): `./data/{userId}/anima.db`
- **Electron mode**: `~/Library/Application Support/anima/data/anima.db`

Multi-tenant: each `ACCESS_TOKEN` maps to a completely isolated SQLite database.

---

## Running Tests

```bash
npm test           # Unit tests (517 tests)
npm run typecheck  # TypeScript type check
npm run test:e2e   # E2E tests (requires dev server running)
```

---

## Documentation

| Doc | Content |
|-----|---------|
| [Architecture](./docs/architecture.md) | System design, data flow, core modules |
| [API Reference](./docs/api.md) | All REST endpoints |
| [Dev Guide](./docs/dev-guide.md) | Local development setup and conventions |
| [Dev Notes](./docs/dev-notes.md) | Design decisions and lessons learned |
| [Deployment](./docs/deployment.md) | Docker / VPS deployment |
| [Deployment (server)](./docs/deployment-server.md) | Production server config & CD |
| [Changelog](./docs/changelog.md) | Version history |
| [Roadmap](./docs/ROADMAP.md) | What's planned |

---

## Contributing

PRs and issues are welcome. See [docs/dev-guide.md](./docs/dev-guide.md) to get started.

---

## License

[MIT](./LICENSE)

---

<p align="center"><i>"Your memories live here. They belong to you."</i></p>
