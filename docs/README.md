# Documentation

| Document | Description |
|----------|-------------|
| [Architecture Decision Records](adrs/) | Technical decisions and rationale |
| [LLM Models Guide](llm-models.md) | LLM provider comparison, pricing, recommendations |
| [Deployment Guide](deployment-raspberry-pi.md) | Raspberry Pi deployment with Cloudflare Tunnel |
| [Test Strategy](test-strategy.md) | Testing approach and coverage |
| [Security Review](security-review.md) | Security posture and recommendations |
| [API Documentation](#api) | Backend API reference |

## API

The backend exposes a REST API at `/api/v1/` (see `app/main.py` for the global prefix).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/chat/stream` | POST | Stream LLM chat response (SSE) |
| `/api/v1/chat/autodebug` | POST | Auto-debug OpenSCAD code |
| `/api/v1/models` | GET | List available LLM models |
| `/api/v1/config/api-keys` | GET | List configured API providers (masked keys) |
| `/api/v1/config/api-keys` | POST | Set an API key |
| `/api/v1/config/api-keys/{provider}` | DELETE | Remove an API key |
| `/api/v1/export/scad` | POST | Export / optimize SCAD code |

### Chat stream (SSE)

`POST /api/v1/chat/stream` accepts a JSON body (messages, model, optional file attachments) and returns `text/event-stream` events with JSON payloads: incremental `token` chunks and a final event with `done: true` and optional extracted `code`.

### Export SCAD

`POST /api/v1/export/scad` accepts code and optional `optimize_for_freecad` to adjust output for FreeCAD-oriented workflows.

## Architecture overview

The application consists of:

1. **Frontend** (React SPA) — Chat, Monaco editor, customizer, file picker, and 3D viewer; calls the backend for LLM and export; runs OpenSCAD WASM in a Web Worker.
2. **Backend** (FastAPI) — LLM proxy (LiteLLM), API key persistence, SCAD formatting / export helpers, model catalog.
3. **OpenSCAD WASM** — Runs in the browser worker for compile/preview/render paths used by the UI.
4. **Nginx** (in Docker) — Serves static frontend assets and proxies `/api` to the backend service.
5. **Cloudflare Tunnel** (optional) — HTTPS access from the internet to the host without opening inbound ports on the router.

For topology and CI/CD images, see [ADR 005 — deployment topology](adrs/005-deployment-topology.md).
