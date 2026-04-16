# ADR 005: Raspberry Pi deployment via Cloudflare Tunnel and Docker Compose

**Status:** Accepted  
**Date:** 2026-04-15

## Context

The service is deployed on a **Raspberry Pi** and reached publicly at **`openscad.brandstaetter.rocks`**. We need TLS at the edge, a single entry path for operators, efficient static hosting, and an isolated API process.

## Decision

Use this **topology**:

1. **One Cloudflare Tunnel** terminates public traffic and forwards to the Pi.
2. An **Nginx container** sits behind the tunnel: serves the **static frontend** and **reverse-proxies** `/api/` to a **FastAPI** application container.
3. **Docker Compose** orchestrates Nginx, FastAPI, and related services.
4. **Authentication** for the public deployment is enforced at **Cloudflare** (**Cloudflare Access** / Zero Trust on the hostname), not as a second login inside FastAPI. The API routes under **`/api/v1/config/api-keys`** therefore assume a **trusted network path**: traffic reaches the backend only after Nginx on the private Docker network (see `docker-compose.yml`), and the **only** internet-facing entry is the tunnel → host port protected by Access. Operators must not expose the backend container port on the host or bypass Access with a parallel public URL.

## Consequences

- **Positive:** **Simple single-tunnel** operation; Nginx serves static assets efficiently; the **API stays containerized** and independently restartable; **HTTPS** is handled by **Cloudflare**; updates follow a familiar **`docker compose pull` / `up`** workflow.
- **Negative / constraints:** Tunnel and Compose become **critical path** for uptime; Nginx config must correctly set headers, body sizes, and timeouts for streaming APIs if applicable.
- **Neutral:** Cloudflare remains the primary place for WAF, caching, and **Access** (identity) policies; Pi-specific tuning (SD wear, backups) stays outside this ADR but is implied operationally.
- **Constraint:** If Access is misconfigured or removed, **`/api/v1/config/api-keys`** is unauthenticated at the application layer — treat Access policy review as part of release/security checklist.
