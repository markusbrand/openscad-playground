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

- `backend/tests/conftest.py` — shared `client` fixture: `ASGITransport(app=app, lifespan="on")` so startup loads the master prompt and constructs `KeyStore`, `LLMService`, and `ExportService` like production.
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
pytest -q
```

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

### Critical flows

1. **Dual-view / shell layout** — Toggle or resize dual view; editor and viewer remain usable.
2. **Settings** — Open settings dialog, optional API key field, close without breaking session.
3. **Export** — Open export dialog, choose options, confirm download or clipboard path if applicable.

E2E runs against `vite preview` or a docker-compose stack; seed env so LLM calls are mocked or use a fixed local model only if the pipeline explicitly provides it.

---

## LLM output validation

Backend `LLMService` centralises:

- **Code extraction** — Regex for fenced code blocks (optional `openscad` language tag); unit tests feed markdown-wrapped and plain responses.
- **OpenSCAD shape** — Assertions that extracted segments contain expected calls (for example `cube(`) and no markdown fence in the extracted string.
- **Auto-debug loop (frontend)** — With worker/runner mocked: inject stderr, assert retry and final code path; backend autodebug tests assert JSON schema (`fixed_code`, `explanation`, `confidence` in `high|medium|low`).

Full OpenSCAD syntax validation in CI is optional (would require a headless `openscad` binary); the product’s WASM runner is better exercised in E2E or dedicated integration jobs.

---

## Continuous integration (recommended)

- **Job 1:** `backend` — `pip install -r requirements.txt -r requirements-dev.txt && pytest`.
- **Job 2:** Frontend — `npm ci && npm run test` (once Vitest scripts exist).
- **Job 3 (nightly or main-only):** Playwright against built assets.

Publish JUnit XML from pytest/playwright for GitHub Actions annotations.

---

## Maintenance principles

- Prefer one obvious assertion per behaviour; group related cases in parametrized tests.
- When the public API changes, update tests first or in the same PR; if old clients must keep working, mark deprecated routes in code and keep tests for both shapes until removal.
- New features ship with at least: unit coverage for services, one integration test if an HTTP surface is added.
