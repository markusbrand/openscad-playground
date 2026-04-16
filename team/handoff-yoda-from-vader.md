# Handoff an Yoda (von Vader) — Tests, CI, Befunde

**Letzte Aktualisierung**: 2026-04-16 (Security-Review + Repo-Hygiene; Tagly/LC Archiv: `team/vader-tagly-reference.md`)

---

## Security-Review (Vader → Yoda) — 2026-04-16

**Quelle:** Code-Pass `backend/app` (FastAPI, KeyStore, LLM, CORS), `src/` (Chat-UI, `fetchSource`), `docker-compose.yml`, `docs/security-review.md`. OWASP Top 10:2021-Mapping steht in **`docs/security-review.md`** § *Review log*.

### Yoda — Routing (wer fixt was)

| Priorität | Befund | Owner | Artefakte / DoD |
|-----------|--------|-------|------------------|
| **P0** | Key-API ohne App-Login — Risiko nur, wenn Backend **ohne** Edge-Schutz erreichbar | **Luke** (Doku) + **R2-D2** (Deploy) | **Entscheidung Nutzer 2026-04-16: Option 3** — Auth nur **Cloudflare Access**, **kein** zusätzlicher FastAPI-Token für `/config/api-keys`. Luke: ADR/Security/Pi-Runbook konsistent (erledigt sobald Doku gemerged). R2-D2: Access-Policy auf Hostname, kein Host-Publish des Backend-Ports, Tunnel nur auf Frontend-Upstream. Optional später: Header-Auth nur wenn Anforderung wechselt (rückwärtskompatibel ergänzbar). |
| **P1** | Kein Rate-Limit auf Chat/Autodebug | **Luke** + **R2-D2** | Luke: `slowapi` o.ä.; R2-D2: nginx/Compose-Notizen, ggf. GHCR-Runbook. |
| **P1** | Fehlertexte an Client bis ~2000 Zeichen (`_format_llm_error`) | **Luke** | Stabile Fehlercodes, generische SSE-`error`-Strings; Details nur `logger.exception`. |
| **P2** | `OLLAMA_BASE_URL` / SSRF-Misconfig | **Luke** | Validator in `Settings` (nur `http(s)://127.0.0.1|localhost` o.ä. oder explizite Allowlist). |
| **P2** | `provider` / `api_key` ohne strikte Längen- und Enum-Validierung | **Luke** | Pydantic: `Literal["gemini",…]` + `max_length`. |
| **P3** | `/docs` offen | **Luke** oder **R2-D2** | `docs_url=None` in Production-Env — abstimmen mit Deploy. |
| **Info** | `fetchSource(url)` im Browser → interne URLs im Unternehmensnetz | **Leia** (+ **C-3PO** Kurz-Hinweis in Doku) | UX/Doku „URLs werden im Browser geladen“; optional URL-Policy im Editor. |

**C-3PO:** `docs/security-review.md` ist aktualisiert; bei Auth-/CORS-Änderungen README/`docs/README.md` mitziehen.

**Repo:** `__pycache__` war **im Git index** — **R2-D2** prüft CI, dass nichts Ähnliches wieder eingecheckt wird; `.gitignore` erweitert, `git rm --cached` auf alle `backend/**/__pycache__` ausgeführt (lokale Ordner bleiben, nur Tracking entfernt).

---

## Kurzstatus (OpenSCAD Playground)

| Gate | Inhalt |
|------|--------|
| **Backend** | `cd backend` → `ruff check .`, `python -m pytest tests/ -v` mit `TESTING=1` (siehe **`.github/workflows/ci.yml`**) |
| **Frontend** | `npm ci`, `npm run build:libs:wasm`, `npm run build` (**`ci.yml`**) |
| **E2E + Matrix** | **`.github/workflows/test.yml`**: Node **lts/-2** & **latest**, `npm run build:all`, Artifact **`dist`**; **`npx playwright install --with-deps chromium`**; **uvicorn** `127.0.0.1:8000`; **`NODE_ENV=development`** und **`production`** → **`npm run test:e2e`** (**Playwright**, `tests/e2e.spec.ts`) |
| **Sicherheit / Review** | **`docs/security-review.md`**, ADRs unter **`docs/adrs/`** — bei Änderungen an Keys, CORS, Export, Chat-Stream mit **Vader** + **C-3PO** abgleichen |

### R2-D2 (Delivery)

CI, GHCR, typische Pipeline-Fallen (u. a. **`setup-python` `cache-dependency-path`**, PWA-Manifest in Dev): **`team/r2d2.md`**. Tagly/Cloudflare/Pi: **`team/r2d2-tagly-cloudflare-pi-runbook.md`** (nur Referenz).

### Vader (QA / Sicherheit)

Routing und **diese** Repo-Tests: **`team/vader.md`**. Archiviertes **Tagly** (LC-1…9, altes Deployment-Review): **`team/vader-tagly-reference.md`**.

---

## Nach einem fehlgeschlagenen Lauf (Vorlage)

```text
Datum:
Workflow / Job (Link):
Branch / Commit:
Fehlgeschlagene Tests (Datei::Test):
Kurzursache (Vader):
Vermutete Schicht (API / UI / Infra):
Assignee (Luke / Leia / R2-D2):
PR/Issue:
```

**Häufige Ursachen (E2E):**

- Backend nicht erreichbar → Vite-Proxy **`/api/v1/models`** → **500**, sichtbar in **`tests/e2e.spec.ts`** (Playwright `console` **error**-Assertions).
- Ungültiges **Web-App-Manifest** in Dev (Historie): **`team/r2d2.md`** Abschnitt *vite-plugin-pwa*.

---

## Definition of Done (orientierend)

- Backend- und Frontend-**CI**-Jobs grün (**`ci.yml`** auf `main` / PRs).
- **`test.yml`** grün, wenn der Workflow für den Branch läuft.
- Doku bei API- oder Deploy-Änderungen angepasst (**`docs/README.md`**, **`README.md`**) oder **Doc-Debt** notiert.

---

## Archiv

Das frühere **Tagly**-Playwright-/LC-Handoff-Material liegt in **`team/vader-tagly-reference.md`** und ist für **OpenSCAD Playground** nicht normativ.
