# Lore — Mailing List Dashboard

A local web dashboard for reading kernel mailing list threads (BPF by default) using the [b4](https://github.com/mricon/b4) utility, with AI-generated thread summaries.

## Features

- **Live thread list** from `lore.kernel.org` — fetches the last 30 days of threads by default
- **Color-coded thread types** — PATCH (blue), RFC (amber), Discussion (emerald), Pull Request (purple)
- **AI summaries** — per-thread summaries with key points, status, and notable reviewers
- **Full thread reader** — read all emails in a thread with diff syntax highlighting
- **Single email navigation** — step through emails one by one with prev/next controls
- **Configurable AI provider** — Claude (default), OpenAI, Ollama (local), or disabled
- **Configurable mailing list** — any `lore.kernel.org` list (BPF, netdev, LKML, etc.)
- **Custom b4 folder** — point to an existing mbox folder or let the app manage its own cache
- **Search & filter** — search by subject/author, filter by thread type

## Prerequisites

```bash
# Python 3.9+
pip install b4 fastapi uvicorn anthropic openai python-dotenv

# Node.js 18+ and pnpm
npm install -g pnpm
```

## Quick Start

```bash
cd bpf-mail-dashboard

# Install frontend dependencies (first time only)
pnpm install

# Start both backend and frontend
bash start.sh
```

The dashboard will be available at **http://localhost:3000**.

## Manual Start

```bash
# Terminal 1: Start the FastAPI backend
cd bpf-mail-dashboard
python3 backend/main.py

# Terminal 2: Start the Vite frontend
cd bpf-mail-dashboard
pnpm dev
```

## Configuration

All settings are accessible from the **Settings** panel in the left sidebar:

| Setting | Default | Description |
|---|---|---|
| List ID | `bpf.vger.kernel.org` | Mailing list ID on lore.kernel.org |
| Days to fetch | `30` | How many days back to fetch threads |
| b4 folder | (managed) | Custom path to store/read mbox files |
| AI Provider | `claude` | `claude`, `openai`, `ollama`, or `none` |
| AI Model | `claude-opus-4-5` | Model to use for summarization |
| API Key | — | Anthropic or OpenAI API key |
| Ollama URL | `http://localhost:11434` | URL for local Ollama instance |

### Well-known mailing lists

| List ID | Name |
|---|---|
| `bpf.vger.kernel.org` | BPF |
| `netdev.vger.kernel.org` | netdev |
| `linux-kernel.vger.kernel.org` | LKML |
| `linux-mm.kvack.org` | linux-mm |
| `kvm.vger.kernel.org` | KVM |
| `io-uring.vger.kernel.org` | io_uring |

## Data Storage

The app stores data in `~/.local/share/lore-mail-dashboard/`:

- `cache/` — thread list cache (10-minute TTL)
- `threads/` — downloaded mbox files (per-thread, on demand)
- `config.json` — user settings
- `summaries.json` — cached AI summaries

## Architecture

```
bpf-mail-dashboard/
├── backend/
│   └── main.py          # FastAPI server (port 8765)
│                        # - wraps b4 for thread fetching
│                        # - parses mbox files
│                        # - calls AI APIs for summaries
├── client/
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx      # Left sidebar (settings, filters)
│       │   ├── ThreadList.tsx   # Thread card list
│       │   └── ThreadPanel.tsx  # Email reader panel
│       ├── lib/
│       │   ├── api.ts           # API client
│       │   └── utils.ts         # Helpers
│       └── pages/
│           └── Dashboard.tsx    # Main layout
└── start.sh             # Startup script
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Get current config |
| PUT | `/api/config` | Update config |
| GET | `/api/threads` | List thread summaries |
| GET | `/api/threads/{msgid}` | Fetch full thread |
| POST | `/api/summarize` | Generate AI summary |
| DELETE | `/api/cache` | Clear thread cache |
| GET | `/api/lists` | Known mailing lists |
