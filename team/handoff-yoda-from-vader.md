# Handoff an Yoda (von Vader) — Tests, CI, Befunde

**Letzte Aktualisierung**: 2026-04-16 (auf **OpenSCAD Playground** ausgerichtet; Tagly/LC Archiv: `team/vader-tagly-reference.md`)

---

## Kurzstatus (OpenSCAD Playground)

| Gate | Inhalt |
|------|--------|
| **Backend** | `cd backend` → `ruff check .`, `python -m pytest tests/ -v` mit `TESTING=1` (siehe **`.github/workflows/ci.yml`**) |
| **Frontend** | `npm ci`, `npm run build:libs:wasm`, `npm run build` (**`ci.yml`**) |
| **E2E + Matrix** | **`.github/workflows/test.yml`**: Node **lts/-2** & **latest**, `npm run build:all`, Artifact **`dist`**; **uvicorn** `127.0.0.1:8000`; **`NODE_ENV=development`** und **`production`** → **`npm run test:e2e`** (**Jest** + **jest-puppeteer**, `tests/e2e.test.js`) |
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

- Backend nicht erreichbar → Vite-Proxy **`/api/v1/models`** → **500**, `console.error` in **`tests/e2e.test.js`**.
- Ungültiges **Web-App-Manifest** in Dev (Historie): **`team/r2d2.md`** Abschnitt *vite-plugin-pwa*.

---

## Definition of Done (orientierend)

- Backend- und Frontend-**CI**-Jobs grün (**`ci.yml`** auf `main` / PRs).
- **`test.yml`** grün, wenn der Workflow für den Branch läuft.
- Doku bei API- oder Deploy-Änderungen angepasst (**`docs/README.md`**, **`README.md`**) oder **Doc-Debt** notiert.

---

## Archiv

Das frühere **Tagly**-Playwright-/LC-Handoff-Material liegt in **`team/vader-tagly-reference.md`** und ist für **OpenSCAD Playground** nicht normativ.
