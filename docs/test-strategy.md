# OpenSCAD Playground — Test Strategy

This document describes how we test the OpenSCAD Playground (Vite + React frontend, FastAPI + LiteLLM backend), where tests live, and how to run them locally and in CI.

## Goals

- Catch regressions in API contracts, streaming behaviour, key storage, and export formatting before release.
- Avoid calling real LLM providers in automated tests (deterministic mocks, no API spend, no flaky network).
- Keep feedback fast: many small unit tests, fewer integration tests, a thin slice of end-to-end checks for critical UX.

## Test pyramid

| Layer | Scope | Tooling | When to add tests |
|-------|--------|---------|-------------------|
| **Unit (backend)** | Routers (thin), services (`LLMService`, `KeyStore`, `ExportService`), pure helpers | [pytest](https://docs.pytest.org/), `pytest-asyncio`, `httpx.AsyncClient` + `ASGITransport` | New business logic, parsing, encryption, export headers |
| **Unit (frontend)** | React components, hooks, `api.ts`, state (`app-state`, `model`) | [Vitest](https://vitest.dev/), `@testing-library/react` | New UI branches, API wrappers, reducers |
| **Integration (backend)** | Full app lifespan, real middleware (CORS), mocked LiteLLM | Same as unit backend; patch `litellm.acompletion` at `app.services.llm_service` | New endpoints, SSE shape, error paths |
| **E2E** | Browser flows: dual-view, settings, export | [Playwright](https://playwright.dev/) | User-visible journeys that span many components |

Higher layers are slower and more brittle; prefer pushing assertions down the pyramid when possible.

---

## Backend testing (pytest)

### Layout

- `backend/tests/conftest.py` — shared `client` fixture: `asgi_lifespan.LifespanManager` plus `httpx.ASGITransport` so ASGI lifespan runs (httpx does not); startup loads the master prompt and constructs `KeyStore`, `LLMService`, and `ExportService` like production.
- Isolated `api_keys_file` under `tmp_path` per test so the encrypted key file never touches the developer’s real `data/api_keys.json`.
- Install: `pip install -r requirements.txt -r requirements-dev.txt` from `backend/`.

### What to cover

| Area | Examples |
|------|-----------|
| **HTTP API** | `GET /api/v1/health`, `GET /api/v1/models`, `POST /api/v1/export/scad`, `GET/POST/DELETE /api/v1/config/api-keys`, `POST /api/v1/chat/stream`, `POST /api/v1/chat/autodebug` |
| **LiteLLM** | Mock `litellm.acompletion` — streaming async iterator for `/chat/stream`; single response object for `/chat/autodebug`. Never rely on real keys in CI. |
| **KeyStore** | Fernet round-trip: write key, new instance reloads; `masked_key` never contains full secret; mapped providers sync env vars |
| **Master prompt** | After lifespan, `app.state.llm_service.master_prompt` is non-empty when `prompts/master-prompt.md` exists |
| **SSE** | Lines start with `data: `, final JSON event has `"done": true`; token events have `"done": false` |
| **Errors** | Mock LiteLLM to raise → SSE final event contains `"error"`; autodebug returns original code + low confidence message |
| **CORS** | `GET` with `Origin` header matches `settings.cors_origins_list`; `access-control-allow-origin` present |

### Running backend tests

```bash
cd backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

On Windows, prefer `python -m pytest` (and `python -m pip`) when the `Scripts` folder is not on PATH.

---

## Frontend testing (Vitest)

### Suggested layout (to be added incrementally)

- `src/**/*.test.ts(x)` next to sources or under `src/__tests__/`.
- Mock `global.fetch` (or the wrapper in `src/services/api.ts`) for deterministic API tests.

### Priority targets

| Target | Intent |
|--------|--------|
| **`api.ts`** | Request URLs, JSON bodies, error handling when `fetch` fails |
| **`Model` / OpenSCAD runner integration** | `autoDebugAndRender` sequencing with mocked worker responses |
| **`ChatPanel`** | Incoming SSE or message list updates, disabled states |
| **`SettingsDialog`** | Masked keys display, save/delete key flows (mock backend) |
| **State** | `app-state` transitions (panel focus, model selection, flags) |

Use Testing Library queries aligned with Material Design labels where possible.

---

## E2E testing (Playwright)

### Layout

- **`playwright.config.ts`** — starts **Vite** via `npm run start:development` / `start:test` (port **4000**) or `npm run start:production` (**3000**) as `webServer`; **Chromium** only; mirrors former jest-puppeteer behaviour.
- **`tests/e2e.spec.ts`** — default page, cube render, BOSL2/NopSCADlib, demos by path/URL, customizer + CRLF; asserts **no unexpected `console` errors** (same bar as before).

### Running E2E locally

1. **One-time:** `npx playwright install chromium` (or `npx playwright install --with-deps chromium` on Linux CI-like hosts).
2. Start **FastAPI** on the port Vite proxies to (default **`BACKEND_PORT=8000`**, see root / `backend` `.env`). If `BACKEND_PORT` in `.env` is not **8000**, either run uvicorn on that port or set `BACKEND_PORT` when starting Vite so `/api/v1/models` does not return **500**.
3. From repo root: `npm run test:e2e` (defaults to `NODE_ENV` unset → **`start:test`** on **4000**), or `NODE_ENV=development npm run test:e2e`, or `NODE_ENV=production npm run test:e2e` (requires **`dist/`** from `npm run build`).

CI: **`.github/workflows/test.yml`** runs `npx playwright install --with-deps chromium`, starts **uvicorn** on **127.0.0.1:8000**, then **`NODE_ENV=development`** and **`production`** `npm run test:e2e`.

### Critical flows (coverage roadmap)

1. **Dual-view / shell layout** — Toggle or resize dual view; editor and viewer remain usable.
2. **Settings** — Open settings dialog, optional API key field, close without breaking session.
3. **Export** — Open export dialog, choose options, confirm download or clipboard path if applicable.

E2E runs against the **Vite** dev server or **`vite preview`**; keep LLM calls out of the critical path where possible (models list should work with a healthy backend; no live chat completion required for current scenarios).

---

## LLM output validation

Backend `LLMService` centralises:

- **Code extraction** — Regex for fenced code blocks (optional `openscad` language tag); unit tests feed markdown-wrapped and plain responses.
- **OpenSCAD shape** — Assertions that extracted segments contain expected calls (for example `cube(`) and no markdown fence in the extracted string.
- **Auto-debug loop (frontend)** — With worker/runner mocked: inject stderr, assert retry and final code path; backend autodebug tests assert JSON schema (`fixed_code`, `explanation`, `confidence` in `high|medium|low`).

Full OpenSCAD syntax validation in CI is optional (would require a headless `openscad` binary); the product’s WASM runner is better exercised in E2E or dedicated integration jobs.

---

## Continuous integration

- **`ci.yml` (main):** backend **pytest** + **ruff**; frontend **`npm run build:libs:wasm`** + **`vite build`**; Docker → GHCR on push to `main`.
- **`test.yml`:** Node matrix, **`npm run build:all`**, Playwright **`npm run test:e2e`** twice (**development** + **production**) with backend on **:8000**.

Publish JUnit XML from pytest (and optionally Playwright `--reporter=junit`) for GitHub Actions annotations if desired.

---

## Maintenance principles

- Prefer one obvious assertion per behaviour; group related cases in parametrized tests.
- When the public API changes, update tests first or in the same PR; if old clients must keep working, mark deprecated routes in code and keep tests for both shapes until removal.
- New features ship with at least: unit coverage for services, one integration test if an HTTP surface is added.
