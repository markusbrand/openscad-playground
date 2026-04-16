# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-16

### Highlights

- **First major line (`1.0.0`)** for the forked OpenSCAD Playground stack (React + Vite + OpenSCAD WASM, FastAPI + LiteLLM backend).
- **Browser E2E** runs on **Playwright** (`tests/e2e.spec.ts`, `playwright.config.ts`); CI installs Chromium and exercises dev + preview modes with a live API.
- **Environment configuration** documented with split **root `.env`** vs **`backend/.env`** (load order, Docker `env_file`, redundancy); deployment runbook table *Sinnvoller Ort*; **R2-D2** team notes for future repos.

### For operators

- Release tag: **`v1.0.0`** — version is aligned across `package.json`, FastAPI `app.version`, and `GET /api/v1/health` (`version` field).
