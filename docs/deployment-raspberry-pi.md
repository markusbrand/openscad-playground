# Deploying OpenSCAD Playground on Raspberry Pi

This runbook describes how to run the **OpenSCAD Playground** stack on a Raspberry Pi behind a **Cloudflare Tunnel**, with optional **Ollama** for local LLMs. HTTPS is terminated at Cloudflare; `cloudflared` forwards traffic to the app on the Pi.

## Prerequisites

- **Raspberry Pi 4 or 5** with **4 GB RAM or more** (8 GB recommended if you plan to run local LLMs).
- **Raspberry Pi OS (64-bit)** or **Ubuntu Server 24.04 LTS** on the Pi.
- **Docker Engine** and the **Docker Compose V2 plugin** (`docker compose`).
- A **Cloudflare** account with a zone you control (this guide uses **`brandstaetter.rocks`** as an example).
- **`cloudflared`** installed on the Pi ([Cloudflare documentation: Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
- **Git** for cloning the repository.

Optional but useful:

- SSH access to the Pi for maintenance.
- A GitHub account if you build from source or use container images from **GitHub Container Registry (GHCR)** once those images are published for your organisation.

---

## 1. Clone and configure

### Clone the repository

```bash
git clone https://github.com/<your-org>/openscad-playground.git
cd openscad-playground
```

Replace `<your-org>` with your GitHub user or organisation name.

### Environment file

The Compose file loads **`./.env`** from the **repository root** for the backend service only (not `backend/.env`). Use the root template:

```bash
cp .env.example .env
nano .env   # or vim, code --remote, etc.
```

See comments in **`.env.example`** vs **`backend/.env.example`** for which variables belong in the root file (Docker) vs optional local overrides.

### Key `.env` settings

| Variable | Purpose | Sinnvoller Ort |
|----------|---------|----------------|
| **`FRONTEND_PORT`** | Host port mapped to the frontend container (default **`3080`**). Point Cloudflare Tunnel at **`http://localhost:<FRONTEND_PORT>`**. Compose default **`3080`** (`${FRONTEND_PORT:-3080}:80`). | **Root** `.env` only — Compose / Host; nicht in `backend/.env` duplizieren. |
| **`BACKEND_PORT`** | Port FastAPI listens on inside the backend container (healthcheck, internal). | **Root** `.env` für Docker; lokal nur in **`backend/.env`**, wenn vom Root abweichend. |
| **`FRONTEND_DEV_PORT`** | Vite dev server (nur lokal relevant). | **Root** `.env` (Vite lädt Root + `backend/`); Override in **`backend/.env`** nur bei Bedarf. |
| **`CORS_ALLOWED_ORIGINS`** | Kommagetrennte Browser-Origins für die API; muss die öffentliche UI-Origin enthalten (z. B. **`https://openscad.brandstaetter.rocks`**). | **Root** `.env` für dieses Pi/Compose-Setup (einzige Datei im Container). Für rein lokales Vite typischerweise **`backend/.env`** mit `http://localhost:<FRONTEND_DEV_PORT>` — siehe `.env.example` / `backend/.env.example`. |
| **API keys** (`GEMINI_*`, …) | Provider-Keys; alternativ UI → Backend-Daten-Volume. | **Root** `.env` hier auf dem Pi (Compose). Lokal oft nur **`backend/.env`**, um Keys nicht im Repo-Root zu haben. |
| **`OLLAMA_BASE_URL`** | Ollama-Endpunkt vom Backend aus. | **Root** `.env`: z. B. `host.docker.internal` / Docker-Netz. **`backend/.env`**: typisch `http://localhost:11434` für `python dev.py`. |
| **`MASTER_PROMPT_PATH`** | Pfad zur Master-Prompt-Datei (relativ zu `backend/`). | **Root** für deployte Images; **`backend/.env`** nur bei lokalem Override. |
| **`MAX_AUTODEBUG_RETRIES`** | Cap für Auto-Debug-Schleifen. | Wo auch die übrigen Backend-Defaults liegen (meist **Root** auf dem Pi). |
| **`LOG_LEVEL`** | z. B. **`INFO`** oder **`DEBUG`**. | Wie oben — **Root** auf dem Pi; lokal optional **`backend/.env`**. |

Example fragment for production behind Cloudflare (root `.env` — see table column *Sinnvoller Ort*):

```env
FRONTEND_PORT=3080
BACKEND_PORT=8000
CORS_ALLOWED_ORIGINS=https://openscad.brandstaetter.rocks,http://localhost:5173
LOG_LEVEL=INFO
```

Set **`FRONTEND_PORT`** in your environment when running Compose if you need a non-default port:

```bash
export FRONTEND_PORT=3080
```

Or add it to `.env` and reference it from a small override file if you standardise on that pattern.

---

## 2. Build and start with Docker Compose

The stack consists of:

- **Backend**: FastAPI on port **8000** inside the Docker network (not published to the host by default).
- **Frontend**: nginx (or equivalent) serving the built SPA on port **80** inside the container, published on the host as **`FRONTEND_PORT`** (default **3080**). The production image is expected to reverse-proxy **`/api/`** to the backend so the browser uses same-origin **`/api/v1`**.

### Pull pre-built images from GHCR (when available)

If your project publishes **`frontend`** and **`backend`** images to GHCR and your `docker-compose.yml` declares `image:` entries with registry paths, authenticate and pull:

```bash
echo <YOUR_GHCR_TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin
docker compose pull
docker compose up -d
```

If **`docker compose pull`** reports no images to pull, your Compose file is likely **build-only**; use the local build path below.

### Build and run locally (recommended until GHCR images are wired)

From the repository root, a full frontend image build typically requires WASM and static assets. On the build machine (the Pi or a CI runner):

```bash
npm install
npm run build:all
docker compose build
docker compose up -d
```

Check status and logs:

```bash
docker compose ps
docker compose logs -f
```

The backend health endpoint is **`GET /api/v1/health`**. From the Pi host (with default port):

```bash
curl -sS http://localhost:3080/api/v1/health
```

You should get a JSON response indicating the API is up.

---

## 3. Set up Cloudflare Tunnel

Traffic flow: **Internet → Cloudflare (TLS) → cloudflared tunnel → http://localhost:3080** on the Pi (single public hostname for UI and API proxy).

### Option A: Using the `cloudflared` CLI (recommended on the Pi)

1. **Login** (opens a browser once):

   ```bash
   cloudflared tunnel login
   ```

2. **Create a tunnel** (pick a stable name, e.g. `openscad-playground`):

   ```bash
   cloudflared tunnel create openscad-playground
   ```

   Note the **tunnel UUID** printed by the command. A credentials JSON file is written under **`~/.cloudflared/`**.

3. **Create or edit** **`~/.cloudflared/config.yml`** (replace placeholders):

   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /home/pi/.cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: openscad.brandstaetter.rocks
       service: http://localhost:3080
     - service: http_status:404
   ```

   Use your actual Linux username instead of **`pi`** if different.

4. **Route DNS** for the hostname to this tunnel:

   ```bash
   cloudflared tunnel route dns openscad-playground openscad.brandstaetter.rocks
   ```

5. **Run the tunnel** (foreground test):

   ```bash
   cloudflared tunnel run openscad-playground
   ```

   For production, prefer a **systemd** service (below).

### Option B: Cloudflare Dashboard (Zero Trust)

1. Open **Cloudflare Dashboard → Zero Trust → Networks → Tunnels**.
2. **Create a tunnel** named e.g. **`openscad-playground`**.
3. **Install the connector** on the Pi using the token or install command shown in the dashboard.
4. Add a **public hostname**: **`openscad.brandstaetter.rocks`** → **`http://localhost:3080`** (same port as **`FRONTEND_PORT`**).

### systemd service for `cloudflared`

After **`config.yml`** is correct:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

If the service fails to start, check logs:

```bash
journalctl -u cloudflared -e --no-pager
```

---

## 4. Verify deployment

On the Pi:

```bash
curl -sS http://localhost:3080/api/v1/health
```

From the internet (DNS propagated, tunnel up):

```bash
curl -sS https://openscad.brandstaetter.rocks/api/v1/health
```

Open **`https://openscad.brandstaetter.rocks`** in a browser and confirm the editor loads and chat (if configured) reaches the backend.

---

## 5. Optional: Ollama for local LLMs

Install Ollama on the Pi (host or a separate container). Example for the official host install:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Pull a model sized for the device (example: **7B-class** quantised model):

```bash
ollama pull qwen2.5-coder:7b
ollama list
```

### Pointing the **backend** container at Ollama

The FastAPI backend runs **inside Docker**. **`http://localhost:11434`** inside that container is **not** the Pi’s host loopback. Use one of these patterns:

1. **Docker `host-gateway` (Compose v2, Linux)**  
   Add to the **`backend`** service in Compose (or an override file):

   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

   Then in **`.env`**:

   ```env
   OLLAMA_BASE_URL=http://host.docker.internal:11434
   ```

2. **Bridge gateway IP** (often **`172.17.0.1`** on default Docker bridges):

   ```env
   OLLAMA_BASE_URL=http://172.17.0.1:11434
   ```

   Verify with `ip addr` / `docker network inspect bridge` if needed.

3. **LAN IP of the Pi** (if Ollama listens on all interfaces):

   ```env
   OLLAMA_BASE_URL=http://192.168.x.x:11434
   ```

After changing **`.env`**, recreate the backend container:

```bash
docker compose up -d --force-recreate backend
```

**Note:** On a **Pi 5 with 8 GB RAM**, prefer **smaller / quantised** models. Larger models increase latency and risk **OOM** kills.

---

## 6. Updating

With images from a registry:

```bash
cd openscad-playground
git pull
docker compose pull
docker compose up -d
```

When building locally:

```bash
cd openscad-playground
git pull
npm install
npm run build:all
docker compose build
docker compose up -d
```

---

## 7. Troubleshooting

| Symptom | Likely cause | What to try |
|--------|----------------|-------------|
| **502 Bad Gateway** (Cloudflare) | Tunnel up but upstream not listening, or backend not ready | `docker compose ps`; `docker compose logs frontend` and `docker compose logs backend`; retry **`curl http://localhost:3080/api/v1/health`**. |
| **CORS errors** in the browser | Origin not allowed | Add **`https://openscad.brandstaetter.rocks`** to **`CORS_ALLOWED_ORIGINS`** in **`.env`**, recreate backend: `docker compose up -d --force-recreate backend`. |
| **LLM timeout / slow** | Model too large for Pi, or cold start | Use a smaller model, cloud API, or ensure Ollama is on the same machine with enough free RAM. |
| **Tunnel not connecting** | `cloudflared` not running or wrong credentials | `sudo systemctl status cloudflared`; check **`~/.cloudflared/config.yml`** tunnel ID and credentials path. |
| **WASM / OpenSCAD runner fails** in the UI | Static assets missing from image | On the build host, run **`npm run build:all`** (includes **`build:libs`**) before **`docker compose build`**. |
| **Ollama unreachable from backend** | Wrong **`OLLAMA_BASE_URL`** for Docker networking | Use **`host.docker.internal`** with **`extra_hosts`**, **`172.17.0.1`**, or the Pi’s LAN IP; confirm **`curl http://<that-host>:11434/api/tags`** from inside the backend container if possible. |

---

## Architecture

High-level view of the recommended single-hostname setup:

```text
Internet
    |
Cloudflare (HTTPS termination)
    |
Cloudflare Tunnel (cloudflared, encrypted)
    |
Raspberry Pi  (localhost:3080  = FRONTEND_PORT)
    |
    +-- Frontend container (nginx :80 published as host :3080)
    |       +-- /           --> static SPA (dist/)
    |       +-- /api/...   --> reverse proxy to backend :8000
    |
    +-- Backend container (FastAPI :8000, internal network)
    |       +-- LiteLLM / HTTP --> cloud provider APIs
    |       +-- LiteLLM / HTTP --> Ollama (optional, on host or LAN)
    |
    +-- Ollama (optional, host :11434)
            +-- e.g. qwen2.5-coder:7b
```

This matches the intent of the project: **one public URL**, **same-origin `/api/v1`**, and **Cloudflare** providing TLS and DDoS protection at the edge.

---

## Related documentation

- Cloudflare Tunnel: [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- Project ADRs and topology: see **`docs/adrs/`** (for example deployment topology if present).

If you standardise on **GHCR image names** or add a **root `.env.example`**, update this document so clone-and-config steps stay one-to-one with the repository layout.
