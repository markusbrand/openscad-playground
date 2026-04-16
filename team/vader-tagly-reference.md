# Vader — Tagly reference (archived QA / security / LC)

**Not OpenSCAD Playground.** This file preserves **Tagly**-specific material that previously lived in `team/vader.md`: a **recorded deployment review** and the **LC-1 … LC-9** full-lifecycle E2E checklist. Use it only when working on that codebase.

Deployment / tunnel runbook: **`team/r2d2-tagly-cloudflare-pi-runbook.md`**.

---

## Recorded review: Tagly deployment hardening (split domain + Cloudflare Tunnel)

**Scope**: Recent changes for **HTTPS public UI** (`tagly.brandstaetter.rocks`) calling **HTTPS API** (`tagly-backend.brandstaetter.rocks`), Django behind **reverse proxy**, **Docker Compose** env passthrough, **Vite** `allowedHosts`, **frontend API** logging. **Not** a full pentest; configuration on the Pi (firewall, Cloudflare Access, secrets rotation) remains operator responsibility.

### Acceptable / aligned

- **CORS / CSRF (OWASP A05:2021 Security Misconfiguration)**: Explicit **`CORS_ALLOWED_ORIGINS`** and **`CSRF_TRUSTED_ORIGINS`** allowlists (trimmed), **`CORS_ALLOW_CREDENTIALS`**, session login with **`withCredentials`** — appropriate for cookie-based SPA + API on different subdomains when both are **HTTPS** and origins are listed.
- **TLS trust at origin (A05)**: **`DJANGO_BEHIND_HTTPS_PROXY`** gating **`SECURE_PROXY_SSL_HEADER`** / **`USE_X_FORWARDED_HOST`** avoids treating proxied HTTPS as HTTP; **Secure** session/CSRF cookies follow — **if** only trusted proxies (e.g. `cloudflared`) reach Django. **Do not** enable proxy trust on paths reachable by untrusted clients without a real proxy striping/forging headers.
- **Secrets (A07:2021)**: **`DJANGO_SECRET_KEY`** injected from **`.env`** via Compose substitution — not hardcoded in source; **`.env`** gitignored.
- **Repo hygiene**: **`celerybeat-schedule`** gitignored — avoids leaking/scheduling state in Git.
- **Client noise vs security (A09:2021)**: Suppressing **`console.error`** for expected **401/403** on **`/users/me/`** does not weaken server-side auth; avoid logging **passwords** or tokens in client code (unchanged expectation).

### Follow-up / residual risk (not blocking home-lab use; track for stricter production)

- **Brute force (A07)**: Login endpoint has **no application-level rate limiting** in reviewed code — rely on **Cloudflare**, **fail2ban**, or network controls for abuse; consider throttling login in Django for higher assurance.
- **Compose default `ALLOWED_HOSTS`**: **`${ALLOWED_HOSTS:-*}`** is permissive for **local dev**; on internet-facing hosts set **explicit** hosts in **`.env`** (already documented in `.env.example`).
- **Vite `allowedHosts`**: Includes **`.brandstaetter.rocks`** — convenient; any future hostname under that registrable domain could be accepted by the dev server’s Host check. Acceptable for controlled DNS; tighten to explicit FQDNs if threat model requires.
- **Forwarded headers**: If Django were reachable **directly** on LAN/WAN without the proxy, a client could send **`X-Forwarded-Proto: https`** — keep **firewall** rules so production traffic only enters via **Cloudflare Tunnel** / intended path.

### Critical

- **None identified** in the reviewed changes for the described deployment model, assuming **TLS to the browser**, **trusted tunnel to origin**, and **secrets only in `.env`**.

---

## Full lifecycle E2E scenario (Tagly — mandatory regression)

**Purpose**: One executable story that stress-tests **real user journeys** end-to-end—not isolated happy paths. This is the bar for calling Tagly “integrated”: if any step fails, **block promotion** until fixed or risk is explicitly accepted.

**Automation target**: Implement as **Playwright** (preferred) plus **API assertions** where stable; keep steps **idempotent** or scoped with a dedicated **`e2e-` / `lc-regression-`** naming prefix and **LC-9 teardown**. Manual runs must still be able to follow the same script.

**Traceability** (Tagly repo): summarized index in `requirements/test-strategy.md` §6.4; normative detail historically lived in `team/vader.md` (now here).

| ID | Phase | Must prove |
|----|--------|------------|
| **LC-1** | Login | Session + CSRF path works for subsequent mutating calls (same-origin or tunnel model). |
| **LC-2** | Asset custom fields (admin) | **Every** `FieldType` for **ASSET** with **validation_rules** and **options** where applicable. |
| **LC-3** | Customer custom fields (admin) | Same breadth for **CUSTOMER** entities. |
| **LC-4** | QR PDF | Generate/download PDF; file non-empty; stickers traceable to assets or template rules. |
| **LC-5** | Onboard multiple assets | **≥2** assets; **frontend submitted values ≡ backend stored values** (GET detail / list custom field map). |
| **LC-6** | Borrow / rent | **Both**: (A) create **new** customer with **all** customer custom fields; (B) pick **existing** customer; assign **multiple** assets. |
| **LC-7** | Return | Return **subset** of borrowed assets; statuses and history correct. |
| **LC-8** | Overdue → notification email | **Missed** `borrowed_until`; job or beat fires; **test email backend** receives expected message (no production inboxes). |
| **LC-9** | Teardown | Remove or soft-delete **all** LC-created data; DB + UI back to **known baseline** (or empty test tenant). |

### LC-1 — Login

- **Steps**: Open app → login with valid user (E2E or dedicated regression user).
- **Assert**: Redirect to protected home/dashboard; `GET /api/v1/users/me/` **200**; subsequent `POST` (e.g. borrow) does **not** fail with CSRF **403** when configured per `.env.example` (tunnel/proxy).
- **Adversarial**: Wrong password **401**; expired session → login wall, no silent data corruption.

### LC-2 — Create ASSET custom fields (all types + checks)

Create definitions covering **STRING, DATE, NUMBER, DECIMAL, SINGLE_SELECT, MULTI_SELECT** (see model `FieldType`). For each type, include at least one field with **non-trivial `validation_rules`** (e.g. STRING `min_length` / `max_length` / `pattern`; NUMBER/DECIMAL `min`/`max`; selects with **choices**).

- **Assert (admin UI)**: Fields visible, save succeeds; duplicate name for same entity type **rejected**.
- **Assert (API)**: `GET /api/v1/custom-fields/definitions/?entity_type=ASSET&page_size=…` returns **all** definitions needed for the form (regression for **pagination hiding mandatory fields**).
- **Negative**: Invalid rule payload **400**; invalid select without choices **400**.

### LC-3 — Create CUSTOMER custom fields (all types + checks)

Mirror **LC-2** for `entity_type=CUSTOMER`. Same API pagination / full-list assertion.

### LC-4 — Print QR PDF

- **Steps**: Admin (or permitted user) generates QR/sticker PDF per product flow.
- **Assert**: Download succeeds; PDF **non-empty**; spot-check structure (e.g. page count, embedded or printable identifiers—match product spec).
- **Adversarial**: Unauthorized role **403**; invalid template **4xx** with clear error.

### LC-5 — Onboard multiple assets; FE vs BE parity

- **Steps**: For **≥2** distinct assets (distinct GUIDs / QR payloads): complete onboarding (scanner or deep link), fill **all** visible asset custom fields including **mandatory** and **optional** edge cases (empty optional, boundary numeric, multi-select).
- **Assert**: After each create, `GET /api/v1/assets/{id}/` (or list with custom columns) **matches** what the UI showed before submit (types coerced consistently, e.g. DECIMAL/NUMBER).
- **Adversarial**: **More than default API page size** of field definitions still onboarded successfully (all keys present in payload vs validator).

### LC-6 — Rent/borrow: new customer vs existing

- **Path A — New customer**: During borrow flow, create customer and fill **all** customer custom fields; complete borrow for **≥1** asset.
- **Path B — Existing customer**: Select a customer created earlier (or seed); borrow **another** asset without re-entering full profile.
- **Assert**: Borrow records **ACTIVE**; asset status **BORROWED**; customer values persisted and visible on detail/history.

### LC-7 — Return assets

- Return **at least one** borrowed asset; leave **at least one** borrowed if multiple were checked out (partial portfolio).
- **Assert**: Returned asset **AVAILABLE**; still-borrowed remains **BORROWED**; return timestamps and history rows correct.

### LC-8 — Overdue timestamp + test email

- **Setup**: Set or seed `borrowed_until` **in the past** for an active borrow (API, admin, or time manipulation in test env).
- **Trigger**: Run overdue notification path (**Celery task** and/or **beat** as implemented—document exact command for CI, e.g. `call_command` or worker in Playwright global setup).
- **Assert**: Notification recorded; **email** captured by **test backend** (console/file SMTP)—**no** real user mailboxes; content references correct asset/customer where spec requires.

### LC-9 — Cleanup / initial state

- **Delete** or **soft-delete** per product rules: LC-created assets, customers, borrow records, custom field **definitions** added in LC-2/LC-3 (or reset test database / tenant).
- **Assert**: Lists empty of `e2e-` / `lc-regression-` entities; no orphan `CustomFieldValue` rows for removed definitions; re-running **LC-1** on clean state passes.

### Output for Yoda (Tagly handoff)

After each LC-* run, record **pass/fail**, **step ID**, **logs/traces**, and **suspected layer** (API/UI/infra) in the Tagly project’s handoff doc (historically `team/handoff-yoda-from-vader.md` there).
