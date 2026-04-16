# OpenSCAD Playground — AI-Powered 3D Printing Assistant

An AI-powered web-based OpenSCAD editor with LLM integration for generating 3D-printable parametric models.

**Upstream lineage:** This project builds on the [OpenSCAD web playground](https://ochafik.com/openscad2/) (OpenSCAD in the browser via WebAssembly, originally by [ochafik](https://github.com/ochafik) and contributors), using a headless WASM build from [DSchroer/openscad-wasm](https://github.com/DSchroer/openscad-wasm). This fork adds a FastAPI backend, LiteLLM-based chat, Material UI, and containerized deployment.

## Features

- **LLM-powered OpenSCAD generation** — Gemini, OpenAI, Claude, Mistral, and local models via Ollama (through [LiteLLM](https://github.com/BerriAI/litellm))
- **Real-time 3D preview** — [model-viewer](https://modelviewer.dev/) web component
- **Auto-debug loop** — Automatic fixes for syntax and manifold-related issues (see [ADR 003](docs/adrs/003-auto-debug-loop.md))
- **STL and SCAD export** — SCAD export with optional FreeCAD-oriented optimization
- **Reference uploads** — STL, SCAD, and images for multimodal prompts where the model supports vision
- **Dark / light Material Design UI** — React 18 + MUI
- **Docker deployment** — Nginx + backend; Raspberry Pi and HTTPS via Cloudflare Tunnel (see [docs/deployment-raspberry-pi.md](docs/deployment-raspberry-pi.md))

Core editor capabilities from upstream remain: OpenSCAD in the browser (Manifold-backed where applicable), customizer, libraries, Monaco editing, and PWA-friendly usage.

## Quick start (development)

**Prerequisites:** Node.js 20+, Python 3.12+

**Windows:** Use **`python`** on your PATH (and **`python -m pip`**, **`python -m pytest`**, **`python -m uvicorn`**). You do **not** need the **`py`** launcher; if `python` is not found in a new terminal, add the folder that contains `python.exe` and its `Scripts` subfolder to your **user** PATH, then open a new shell.

```bash
git clone <repo-url>
cd openscad-playground

# Frontend
npm install
npm run build:libs    # OpenSCAD WASM and libraries (first time / after clean)
npm run dev           # Vite — port from FRONTEND_DEV_PORT (default 5173), see .env.example

# Backend (separate terminal)
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env — add API keys and CORS origins
python dev.py               # port from BACKEND_PORT (default 8000); or: npm run dev:backend from repo root
```

Ports are configurable via **root** `.env` and/or **`backend/.env`** (see [Configuration](#configuration)): `FRONTEND_DEV_PORT`, `BACKEND_PORT`, and for Docker `FRONTEND_PORT`. **CORS** and **API keys**: sinnvoller in **`backend/.env`** für lokales Vite, im **Root-`.env`** wenn du nur Docker nutzt — siehe Kommentare in [`.env.example`](.env.example) und [`backend/.env.example`](backend/.env.example).

## Docker deployment

From the repository root:

```bash
cp .env.example .env   # Configure ports, CORS, keys (see comments in file)
docker compose build
docker compose up -d
```

The stack builds the **backend** image (publishable to **GHCR** in CI) and a static **frontend** image; Nginx in the frontend container proxies `/api` to the backend. Default published port: **3080** (`FRONTEND_PORT`).

Full steps for a Raspberry Pi with **Cloudflare Tunnel** and **GHCR** pulls: [docs/deployment-raspberry-pi.md](docs/deployment-raspberry-pi.md).

## Architecture

The **React** SPA talks to a **FastAPI** service under `/api/v1`. OpenSCAD compilation and preview run in the browser via **Web Workers** and WASM; the backend handles LLM calls, API key storage, and SCAD formatting/export helpers.

Design decisions are recorded as **ADRs**: [docs/adrs/](docs/adrs/). Documentation index: [docs/README.md](docs/README.md).

## Tech stack

| Area | Technologies |
|------|----------------|
| Frontend | React 18, TypeScript, MUI, Monaco Editor, Vite |
| Backend | FastAPI, LiteLLM, Python 3.12 |
| 3D | OpenSCAD WASM, model-viewer |
| Deploy | Docker, Nginx, Cloudflare Tunnel, GitHub Actions → GHCR |

## Configuration

- **Root** [`.env.example`](.env.example) — Ports und alles, was **`docker compose`** in den Backend-Container braucht (Compose liest nur diese Datei).
- **Backend** [`backend/.env.example`](backend/.env.example) — typisch **lokale** Overrides (CORS für Vite, Ollama `localhost`, API-Keys). FastAPI/Vite: **Root zuerst**, dann **`backend/.env`** (bei doppeltem Namen gewinnt `backend/.env`).

| Variable | Purpose |
|----------|---------|
| `FRONTEND_PORT` | Published host port for the frontend container (`docker compose`; default **3080**) |
| `BACKEND_PORT` | TCP port for uvicorn (`python dev.py` / Docker backend; default **8000**) |
| `FRONTEND_DEV_PORT` | Vite dev server port (`npm run dev`; default **5173**); repo root and/or `backend/.env` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `MASTER_PROMPT_PATH` | Path to server system prompt (default: `prompts/master-prompt.md`) |
| `OLLAMA_BASE_URL` | Ollama API base URL for local models |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` | Optional; keys can also be set via the UI |
| `MAX_AUTODEBUG_RETRIES` | Cap on auto-debug attempts |
| `LOG_LEVEL` | Python logging level |

## LLM providers

Models are proxied through LiteLLM; the UI loads the catalog from `GET /api/v1/models` (known cloud models plus dynamic **Ollama** discovery). Comparison, pricing notes, and recommendations: [docs/llm-models.md](docs/llm-models.md).

## Documentation

- [docs/README.md](docs/README.md) — index (API table, ADRs, deployment, testing, security)

## Contributing

1. Fork the repository and create a branch for your change.
2. Run frontend and backend locally (see [Quick start](#quick-start-development)); add or update tests where applicable (`backend`: pytest; browser E2E: **`npm run test:e2e`** with Playwright — see [docs/test-strategy.md](docs/test-strategy.md)).
3. Keep commits focused; follow existing code style and logging patterns.
4. Open a pull request with a clear description of behavior and any breaking API changes.

## License

The OpenSCAD Web Demo source is licensed under **GNU GPL v2 or later**; deployed artifacts may be subject to **GPLv3** when linking certain dependencies. Bundled components and library licenses are summarized in **[LICENSE.md](LICENSE.md)** (see also component-specific files such as `LICENSE.monaco`, `LICENSE.viewstl`).
