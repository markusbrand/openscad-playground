# Security review

High-level security posture for the OpenSCAD Playground (fork with AI backend). This is guidance, not a formal audit.

## Threat model (summary)

| Asset | Risk |
|-------|------|
| LLM **API keys** | Disclosure via logs, backups, or unauthorized API access |
| **User prompts / code** | Sensitive data sent to third-party LLM providers |
| **Host** (Pi / server) | Exposed admin surfaces, outdated containers, weak tunnel auth |

## Chosen control: Cloudflare Access (2026-04-16)

**Product decision:** Login and access control for the **deployed** app rely on **Cloudflare Access** (Zero Trust) in front of the public hostname — see **ADR 005** (`docs/adrs/005-deployment-topology.md`) and **`docs/deployment-raspberry-pi.md`**. The backend **does not** add a separate bearer/API-token layer for **`/api/v1/config/api-keys`**; that is intentional when **all** API traffic is only reachable through Access-protected ingress (Nginx + private backend, no published backend port). **Local dev** (`uvicorn` + Vite) remains trust-on-LAN; do not forward the dev backend port to the public internet without additional controls.

## Current controls

- **CORS** restricted via `CORS_ALLOWED_ORIGINS` — misconfiguration is a common issue; only list trusted front-end origins.
- **API keys** stored server-side (file under `backend/data` by default); list endpoints return **masked** values — avoid logging raw keys (application uses structured logging; keep log level appropriate in production).
- **HTTPS** recommended for any internet-facing deployment (e.g. Cloudflare Tunnel terminates TLS).
- **No OpenSCAD execution on the server** for user models — WASM runs in the user’s browser, reducing server-side code-injection blast radius for geometry compilation.

## Recommendations

1. **Secrets:** Prefer environment variables or a secrets manager in production; rotate keys if logs or images may have captured them.
2. **Backend exposure:** Do not publish the backend port directly unless required; use Nginx + private Docker network as in `docker-compose.yml`.
3. **Tunnel / Cloudflare:** Lock down Cloudflare Access or Zero Trust if the app should not be public; review tunnel token storage on the Pi (`docs/deployment-raspberry-pi.md`).
4. **Dependencies:** Enable Dependabot (repository includes `.github/dependabot.yml`) and rebuild images on security patches.
5. **LLM data handling:** Treat prompts and uploaded files as **sensitive**; inform users that cloud providers process content under their own terms.
6. **Rate limiting / abuse:** Application-level rate limits are optional; use **Cloudflare** (and/or Nginx) limits for internet-facing deployments. **Auth** for the key-management API is **not** duplicated in FastAPI when **Cloudflare Access** protects the site — keep Access policies aligned with who may use Settings / API keys.

## Review log (Vader — 2026-04-16)

Structured pass against OWASP Top 10:2021-style risks. **Handoff and assignees:** [`team/handoff-yoda-from-vader.md`](../team/handoff-yoda-from-vader.md) (Yoda routing).

### Critical

- **API-key management without in-app login** (`POST|GET|DELETE /api/v1/config/api-keys`) — Any client that can **reach the backend HTTP port** can **set, list (masked), or delete** keys. **OWASP:** A01 Broken Access Control, A07 Identification and Authentication Failures. **Mitigation (chosen):** **Cloudflare Access** on the public hostname + topology per **ADR 005** (no direct backend exposure; single ingress). **Residual risk:** misconfigured tunnel, host-published backend port, or dev stack exposed to the internet — fix operationally; optional future in-app token remains a **backward-compatible** add-on if requirements change.

### High

- **No rate limiting on LLM routes** — Comment placeholder exists in `backend/app/main.py`. Public exposure enables **cost and availability abuse** (chat stream, autodebug). **OWASP:** A04 Insecure Design, A05 Security Misconfiguration. **Fix:** Reverse-proxy limits (nginx, Traefik, Cloudflare) and/or `slowapi` (or similar) on expensive endpoints.

### Medium

- **SSE / client error payloads** — `_format_llm_error` may return up to ~2000 characters of provider exception text to the client (see `LLMService._format_llm_error`). Can leak **internal detail** depending on the library. **OWASP:** A09 Security Logging and Monitoring Failures (paired with information disclosure). **Fix:** Stable public error codes + generic message; log full detail server-side only.

- **`OLLAMA_BASE_URL` trust** — Model discovery calls `settings.ollama_base_url` from the server. A **mis-set or malicious env** value is server-side SSRF risk toward that URL. **OWASP:** A10 SSRF. **Fix:** Allowlist schemes/hosts in config or restrict to loopback in production profiles.

- **`ApiKeySetRequest` / `provider`** — No allowlist in the schema; arbitrary strings are persisted in the encrypted blob (unknown providers do not map to env vars). Low integrity risk; possible **noise or storage abuse** with huge payloads if request body limits are not tightened. **Fix:** Pydantic `Literal[...]` or enum for `provider`; `Field(max_length=…)` on `api_key`.

### Low / info

- **OpenAPI docs** (`/docs`, `/redoc`) — Expose the attack surface on deployments where the API is internet-facing. Disable or protect in production if desired.

- **Repository hygiene** — Python `__pycache__` must not be tracked (noise, occasional stale-bytecode confusion). **Mitigation:** `.gitignore` patterns + remove from version control (done 2026-04-16).

- **Browser `fetchSource(url)`** — User-controlled URLs in the OpenSCAD worker run **in the user’s browser**; in corporate networks this can reach **internal hosts** the user can reach (browser-context “SSRF”). Document risk; optional allowlist/block private IP ranges if URLs are ever server-side.

### Positive controls (unchanged summary)

- Chat attachments: path stripped, extension and MIME allowlist, size cap (`backend/app/routers/chat.py`).
- CORS driven by `CORS_ALLOWED_ORIGINS` (comma-separated); credentials enabled — keep origins **explicit**, never wildcard, in production.
- API keys at rest: Fernet file encryption; list endpoint returns masked values only.
- No server-side OpenSCAD execution of user geometry; WASM in browser limits server RCE from SCAD.

## Reporting issues

Report suspected vulnerabilities privately to the repository maintainers with reproduction steps and affected version/commit.
