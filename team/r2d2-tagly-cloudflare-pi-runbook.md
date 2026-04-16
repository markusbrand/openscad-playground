# R2-D2 — Tagly / Cloudflare Tunnel / Raspberry Pi (reference runbook)

**Scope:** This runbook describes a **Django + Vite (Tagly-style)** deployment behind **Cloudflare Tunnel** on a **Raspberry Pi**. It was **split out** from `team/r2d2.md` because **`openscad-playground`** does not use this stack. Keep this file for **another repo** or **historical** ops reference—not as the default for OpenSCAD Playground CI/CD (see `team/r2d2.md`). **Tagly QA / LC-1…9** and the recorded security review: **`team/vader-tagly-reference.md`**.

The SPA uses **cookies** (`withCredentials`); **CORS** and **CSRF trusted origins** must list every **browser origin** that loads the UI when the API is on a **different** host. The **recommended** setup below avoids a second public hostname for the API.

---

## A. Recommended — **one tunnel** (UI only) + Vite `/api` proxy (Tagly default)

**Idea:** Only expose the **frontend** hostname (e.g. `tagly.brandstaetter.rocks` → tunnel → `http://127.0.0.1:5173`). The browser calls **`https://<ui-host>/api/v1/...`** (same origin). **Vite** proxies `/api` to Django (`VITE_DEV_PROXY_TARGET`). No second tunnel to Django on `:8008`, no cross-origin API from the browser during dev.

| Item | Action |
|------|--------|
| **Cloudflare Tunnel** | **One** public hostname → `http://127.0.0.1:5173` (Vite dev) or → reverse proxy serving `frontend/dist` in production. |
| **`tagly-backend.brandstaetter.rocks`** | **Optional / legacy.** If you use (A), you can **delete** that tunnel route and DNS record once `VITE_API_URL` is **not** pointing at the backend hostname. |
| **`VITE_API_URL`** | **`/api/v1`** (relative; Compose default). Same origin as the page. |
| **`VITE_DEV_PROXY_TARGET`** | **Inside Compose `frontend` container:** `http://backend:8008` (default in `docker-compose.yml`). **If Vite runs on the Pi host** (`npm run dev` without the frontend container): **`http://127.0.0.1:8008`** — never `http://backend:8008` on the host (hostname exists only in Docker network). |
| **`VITE_DEV_PUBLIC_HOST`** | Public UI hostname **without** scheme, e.g. `tagly.brandstaetter.rocks` — enables HMR (`wss`) and **`server.origin`** in `vite.config.ts` so pre-bundled deps (`/node_modules/.vite/deps/…`) resolve correctly behind the tunnel. |
| **`VITE_ALLOWED_HOSTS`** | Extra hostnames for `server.allowedHosts` (comma-separated); `https://` is stripped in code. Hostnames only also work. |

**Backend (Django)** for (A):

| Variable | Purpose |
|----------|---------|
| `ALLOWED_HOSTS` | Include the **UI** hostname (e.g. `tagly.brandstaetter.rocks`) or `*` for home lab — the browser `Host` header is the UI host when using the proxy. You do **not** need the old API-only hostname if you removed that tunnel. |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | Must include **`https://<ui-host>`** (and LAN dev entries if needed). No separate API public URL required for same-origin `/api`. |
| `DJANGO_BEHIND_HTTPS_PROXY` | **`1`** on the Pi when users reach the site via **HTTPS** at Cloudflare. |

**PWA service worker (`frontend/public/sw.js`):** Intercepts only **same-origin** HTTP(S) requests. Cross-origin calls to a separate API host are **not** wrapped (avoids fake `503 { "error": "Offline" }` when `fetch` fails). In **`import.meta.env.DEV`**, SW registration is skipped and existing registrations are cleared.

**Operational notes:**

- **`docker compose`:** `backend` has a **healthcheck** (`curl` `/api/v1/health/`); **`frontend`** waits for **`backend: service_healthy`** so Vite does not start while Django is down.
- After **`backend/requirements.txt`** changes: run **`docker compose build backend`** (and `up -d`). Stale images cause `ModuleNotFoundError` (e.g. `drf_spectacular`) → backend **unhealthy**, `curl` to `:8008` may **reset** — not a tunnel bug.
- If Django warns about **unapplied migrations**, run `docker compose exec backend python manage.py migrate`.

---

## B. Optional — **split hostname** (second tunnel to Django)

Use only if the browser must call the API on a **different** origin (e.g. `https://tagly-backend.brandstaetter.rocks/api/v1`).

**Cloudflare Tunnel ingress (two routes):**

- `tagly-backend…` → `http://127.0.0.1:8008` (Django).
- UI hostname → `http://127.0.0.1:5173` or static `dist/`.

**`VITE_API_URL=https://tagly-backend.brandstaetter.rocks/api/v1`**

Then **`CORS_*` / `CSRF_*`** must allow the **UI** origin; **`ALLOWED_HOSTS`** must include the **API** hostname. If Cloudflare returns **502**, the browser often reports **missing CORS headers** on the error HTML — fix **reachability** of the API tunnel first.

---

## C. Misleading errors (save time next incident)

| Symptom | Likely cause |
|---------|----------------|
| Cloudflare **502**, diagram shows **Host** origin **Error** | Tunnel → Pi/Vite not reachable (wrong port, `cloudflared` down, container stopped). Affects **all** paths including `/node_modules/.vite/deps/…` **and** `/api/`. |
| **`curl` UI `:5173/` = 200**, **`/api/v1/health/` = 502** | Vite OK; **proxy** cannot reach Django — wrong `VITE_DEV_PROXY_TARGET` (e.g. `backend` on host OS) or **backend** down / **unhealthy**. |
| **`curl` `:8008` connection reset**, backend **unhealthy** | Django not listening — check **`docker compose logs backend`** (import errors, missing venv packages → **rebuild** image). |
| Login / API looked like **“Offline”** or **503** with JSON `{ "error": "Offline" }` | Old SW behaviour; current `sw.js` does not replace cross-origin failures with that payload. |

---

## D. Vite dev — `Host` allowlist

**Vite** rejects unknown `Host` headers. The Tagly repo sets `server.allowedHosts` in `frontend/vite.config.ts` plus optional **`VITE_ALLOWED_HOSTS`**. If you see “Blocked request / not allowed”, pull latest config and restart the frontend process.

---

## E. HTTPS and Django behind the tunnel

Clients use **HTTPS** at Cloudflare; the origin often sees **HTTP** to Vite/Django. Set **`DJANGO_BEHIND_HTTPS_PROXY=1`** in the backend `.env` on the Pi so `SECURE_PROXY_SSL_HEADER` / `USE_X_FORWARDED_HOST` match `settings.py` and **secure** session/CSRF cookies work.

---

## F. Troubleshooting (short)

- **CORS** (real cross-origin): Wrong or missing `CORS_ALLOWED_ORIGINS` / `https` vs `http`.
- **403 CSRF**: Exact UI origin in `CSRF_TRUSTED_ORIGINS`.
- **Split API host + 502**: Fix API tunnel/upstream before debugging CORS text in the browser.

---

## Git hygiene on the Raspberry Pi (pull / deploy hosts)

**Goal**: Only **application source** comes from GitHub; **machine-local config, runtime state, and data** stay out of the repo (already covered by `.gitignore` where applicable).

| Topic | Policy |
|-------|--------|
| **Secrets & config** | Use **`.env`** on the Pi (already gitignored). Never commit `.env`. Document keys in `.env.example` only. |
| **Celery Beat** | The file **`celerybeat-schedule`** (under `backend/` when Beat runs from there) is a **runtime schedule database**, not source. It is **gitignored**; do not add or commit it. If `git pull` complains it would overwrite an untracked `celerybeat-schedule`, remove or move it aside, pull, then let Beat recreate it. |
| **`package-lock.json`** | Stays **tracked** in the repo (lockfile for reproducible installs). If the Pi shows “local changes would be overwritten” on pull, you usually want **upstream’s** lockfile: e.g. `git checkout -- frontend/package-lock.json`, then `git pull`. Avoid committing Pi-only drift unless you intentionally regenerate the lockfile on a dev machine and merge via PR. |
| **Postgres / uploads** | DB files live in **Docker volumes** or host paths **outside** the clone — not in Git. Same for `media/` (gitignored). |

---

## What changed in the Tagly repo (R2-D2 handoff — Cloudflare / Pi)

**Security review (split-host / HTTPS):** **Vader** — `team/vader-tagly-reference.md` → *Recorded review: Tagly deployment hardening*.

**Delivery behaviour:** Prefer **one tunnel** to the UI + **`VITE_API_URL=/api/v1`** + Vite **`/api` proxy** (section **A** above). A second hostname for the API is **optional**; DNS + tunnel for `tagly-backend…` can be removed once nothing references it.

| Area | Change |
|------|--------|
| **`docker-compose.yml`** | Env from project **`.env`**; frontend defaults **`VITE_API_URL=/api/v1`**, **`VITE_DEV_PROXY_TARGET=http://backend:8008`**; optional **`VITE_DEV_*`** for tunnel HMR; **`backend`** **healthcheck**; **`frontend`** **`depends_on: backend: service_healthy`**. |
| **`backend/tagly/settings.py`** | **`_split_env_list`**; **`DJANGO_BEHIND_HTTPS_PROXY`** for forwarded HTTPS and secure cookies. |
| **`frontend/vite.config.ts`** | **`server.allowedHosts`**, optional **`server.origin`** + **HMR** when **`VITE_DEV_PUBLIC_HOST`** set; **`server.proxy`** `/api` → **`VITE_DEV_PROXY_TARGET`** (`changeOrigin: false`, **`xfwd`**, proxy error logging). |
| **`frontend/src/services/api.ts`** | Default **`baseURL`** **`/api/v1`**; no noisy **`console.error`** on expected **401/403** for **`/users/me/`**. |
| **`frontend/public/sw.js`** | Only same-origin `fetch` handling; cross-origin API not wrapped. |
| **`frontend/src/main.tsx`** | Service worker only in **production**; in **dev**, unregister existing SW. |
| **`frontend/src/pages/Login.tsx`** | Surfaces API **`detail`** on failures where present. |
| **`.gitignore`** | **`celerybeat-schedule`**. |
| **`README.md`** | Cloudflare: single-tunnel + proxy, 502/CORS confusion, **`ModuleNotFoundError`** → rebuild backend, migrations, **`curl`** diagnostics. |

**Operational checklist (Pi)** after `git pull`:

1. **Single-tunnel / proxy (recommended):** **`VITE_API_URL=/api/v1`**, remove any old **`VITE_API_URL=https://tagly-backend…`** from `.env`; **`CORS_*` / `CSRF_*`** include **`https://<ui-host>`**; **`DJANGO_BEHIND_HTTPS_PROXY=1`**; **`docker compose build backend`** if **`requirements.txt`** changed; **`docker compose exec backend python manage.py migrate`** if Django warns.
2. **Optional split API host:** **`VITE_API_URL`** = public **https** API base; **`CORS_*` / `CSRF_*`** include UI origin; **`ALLOWED_HOSTS`** includes API hostname; second tunnel must reach **:8008**.
3. **Deleting `tagly-backend.brandstaetter.rocks`:** After (1), remove **Cloudflare Tunnel** route + **DNS** for that name; drop it from **`ALLOWED_HOSTS`** if it was listed; no code change required if the browser never calls that host.
