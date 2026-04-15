# ADR 001: LiteLLM as unified LLM abstraction

**Status:** Accepted  
**Date:** 2026-04-15

## Context

The application must integrate multiple LLM vendors—Gemini, OpenAI, Claude, Mistral, and Ollama—without maintaining separate client stacks, auth flows, and response parsers for each. We need one integration surface that still allows provider-specific configuration where necessary.

## Decision

Use **LiteLLM** (Python library) as the unified abstraction. It exposes a single **OpenAI-compatible** API across 100+ providers, includes retries and fallbacks, and supports **streaming** responses suitable for chat UX.

## Consequences

- **Positive:** One dependency covers all current and many future providers; adding a new backend is mostly configuration. Retries, fallbacks, and streaming reduce bespoke plumbing.
- **Negative / constraints:** A **Python backend** is required wherever LiteLLM runs. Operational and security practices must account for API keys and provider quotas in one layer.
- **Neutral:** Teams standardize on OpenAI-shaped request/response shapes, which simplifies client and test tooling.
