# ADR 006: Migrate main app build from Webpack 5 to Vite

**Status:** Accepted  
**Date:** 2026-04-15

## Context

The current frontend build uses **Webpack 5** with a **complex WASM worker** setup. We want faster local development, simpler modern defaults, and tooling aligned with current ESM-first practice.

## Decision

**Migrate the main application bundle to Vite.** Keep **library builds** (or other non-app artifacts) on a **standalone Node script** pipeline so Vite does not absorb every packaging concern in one config.

## Consequences

- **Positive:** **Faster HMR** and generally quicker dev feedback; **ESM-native** bundling and clearer defaults for modern browsers.
- **Negative / constraints:** **WASM worker loading** must be revalidated under Vite (URL imports, worker types, and dev vs prod parity). **`public/`** asset handling and base URL behavior differ slightly from Webpack—migrations need a short checklist.
- **Neutral:** Two build modes (Vite app + Node script for libs) are acceptable if boundaries are documented to avoid duplicate logic.
