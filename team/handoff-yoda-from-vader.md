# Handoff an Yoda (von Vader) — Tests, CI, Befunde

**Letzte Aktualisierung**: 2026-04-03 (E2E-Skript, Migration `users.0003`, Doc-Sync)

---

## Kurzstatus (Repo-Stand)

| Gate | Inhalt |
|------|--------|
| Backend | `ruff`, `pytest` (**38** Tests), `spectacular --validate --fail-on-warn` |
| Frontend | `eslint`, Vitest, `vite build` |
| CI | `.github/workflows/ci.yml`: Backend-Job, Frontend-Job, **E2E – Playwright**-Job |
| E2E lokal | `frontend/`: `npm run test:e2e:local` → `scripts/e2e-local.sh` (venv, `.env` per python-dotenv, `POSTGRES_HOST_PORT`/`REDIS_HOST_PORT`-Mapping); `npm run test:e2e:local:ui` für Playwright UI |

### R2-D2 (Delivery)

Setup-Doku: `team/r2d2.md`. Ein-Tunnel + Vite-`/api`-Proxy, Compose-Healthchecks, HTTPS-Proxy-Flags — **abgeglichen** mit `docker-compose.yml`, `vite.config.ts`, `settings.py`.

### Vader (QA / Sicherheit)

Keine neuen Blocker im letzten Review; Restrisiken (Rate-Limit Login, explizite `ALLOWED_HOSTS` in Prod, Forwarded-Header nur hinter vertrauenswürdigem Proxy) siehe `team/vader.md` *Recorded review*.

---

## Playwright E2E — Implementierung

| Artefakt | Zweck |
|----------|--------|
| `frontend/playwright.config.ts` | Django (`migrate`, `ensure_e2e_user`, `runserver`) + Vite; CI **8008/5173**, lokal **18008/15173** |
| `backend/users/management/commands/ensure_e2e_user.py` | Idempotenter E2E-User (`E2E_USERNAME` / `E2E_PASSWORD`) |
| `backend/users/migrations/0003_alter_user_managers.py` | `UserManager` am Custom-User — **Migration ausstehend bis `migrate`** auf jeder Umgebung |
| `frontend/e2e/*.spec.ts` | Login + geschützte Route |
| `scripts/e2e-local.sh` | Lokaler Lauf mit `backend/.venv`, sicherem `.env`-Load, Port-Mapping für Docker-DB/Redis |

**Breitere Szenarien** (Onboarding, Scanner, Admin): iterativ; siehe `requirements/test-strategy.md`.

### Full-Lifecycle-Regression (LC-1 … LC-9)

Normative Schritte (Login → Custom Fields Asset+Customer → QR-PDF → Multi-Onboarding FE/BE → Borrow beide Pfade → Return → Overdue-Mail → Cleanup): **`team/vader.md`** § *Full lifecycle E2E scenario*. **Yoda** verteilt Failures sofort an **Luke / Leia / R2-D2** (siehe `team/yoda.md` § *Test results from Vader*).

**Playwright (implementiert)**:

- `frontend/e2e/lc-r2d2-wiring.spec.ts` — LC-1 + API-Definitions `page_size`
- `frontend/e2e/lc-luke-lifecycle.spec.ts` — LC-2…LC-9 (serial, DB-mutierend)
- `python manage.py run_overdue_check` / `e2e_cleanup_lc` — siehe `team/yoda.md` § *Playwright LC implementation*

| LC-ID | Kurz | Typische Owner bei Fail |
|-------|------|-------------------------|
| LC-1 | Login / Session / CSRF | Luke + ggf. R2-D2 (Env/Tunnel) |
| LC-2, LC-3 | Custom Fields Admin + API | Luke (API), Leia (UI) |
| LC-4 | QR-PDF | Luke |
| LC-5 | Multi-Onboarding, FE≡BE | Luke + Leia |
| LC-6, LC-7 | Borrow/Return | Luke + Leia |
| LC-8 | Overdue + Test-E-Mail | Luke (+ R2-D2 Worker/CI) |
| LC-9 | Teardown / Initialzustand | Luke + Leia + R2-D2 (DB/CI) |

**Template (pro Lauf):**

```text
Datum:
LC-ID(s) failed:
Umgebung (CI / lokal / Pi):
Artifact (Link / Pfad):
Kurzursache (Vader):
Assignee:
PR/Issue:
```

---

## Definition of Done

- [x] Unit/Integration-Backend + Frontend-Unit + Build in CI
- [x] OpenAPI-Validierung in CI
- [x] E2E-Job in CI + lokales Wrapper-Skript
- [x] Technische Doku / README mit E2E und CI beschrieben

---

## Archiv-Hinweis

Ältere Einzelreviews (DECIMAL-Validators, Vitest-Einführung, ESLint react-refresh) — Git-Historie; obige Tabelle beschreibt den **aktuellen** erwarteten CI-/Test-Stand.
