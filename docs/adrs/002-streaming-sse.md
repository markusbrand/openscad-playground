# ADR 002: Server-Sent Events for LLM streaming

**Status:** Accepted  
**Date:** 2026-04-15

## Context

LLM completions can take several seconds. Users need **incremental, real-time** feedback (tokens or chunks) rather than waiting for a full response body.

## Decision

Use **Server-Sent Events (SSE)** for chat streaming, implemented with **FastAPI’s `StreamingResponse`**. The server pushes events as the model generates output; the client consumes them over a long-lived HTTP connection.

## Consequences

- **Positive:** **Real-time** token or chunk display; **simple browser client** via the standard `EventSource` API (or fetch-based SSE readers where needed). SSE typically **works through Cloudflare and Nginx** reverse proxies with appropriate buffering and timeout settings.
- **Negative / constraints:** SSE is **unidirectional (server → client)** only; if we later need low-latency client-to-server streams on the same socket, WebSockets would be a separate choice.
- **Neutral:** For our chat use case, unidirectional streaming is sufficient and keeps the protocol simpler than full-duplex alternatives.
