# Security review

High-level security posture for the OpenSCAD Playground (fork with AI backend). This is guidance, not a formal audit.

## Threat model (summary)

| Asset | Risk |
|-------|------|
| LLM **API keys** | Disclosure via logs, backups, or unauthorized API access |
| **User prompts / code** | Sensitive data sent to third-party LLM providers |
| **Host** (Pi / server) | Exposed admin surfaces, outdated containers, weak tunnel auth |

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
6. **Rate limiting / auth:** Not built into the demo backend; add reverse-proxy rate limits or API auth if exposing broadly on the internet.

## Reporting issues

Report suspected vulnerabilities privately to the repository maintainers with reproduction steps and affected version/commit.
