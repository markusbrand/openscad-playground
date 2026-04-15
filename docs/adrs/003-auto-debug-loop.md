# ADR 003: Client-side automatic debug/fix loop for OpenSCAD

**Status:** Accepted  
**Date:** 2026-04-15

## Context

LLM-generated OpenSCAD often fails with **syntax errors** or **manifold / geometry** issues. Expecting users to manually copy errors back into chat is slow and error-prone.

## Decision

Implement a **client-side auto-debug loop**:

1. Compile generated code in the browser via **OpenSCAD WASM**.
2. On failure, send compiler/parser errors to the backend **`/api/v1/chat/autodebug`** with enough context for the model to propose a fix.
3. Apply returned code and **recompile**.
4. Cap the loop at **three retries** to avoid infinite correction cycles.

## Consequences

- **Positive:** **Better UX** with less manual fixing; structured **error context** improves fix quality compared to vague user messages.
- **Negative / constraints:** A **fixed retry budget** may leave some models stuck after three attempts; product copy or UI should explain when manual intervention is needed. Backend must treat autodebug as a distinct, possibly rate-limited path.
- **Neutral:** Logic lives primarily on the client (compile + orchestration), keeping the server focused on LLM calls and validation policies.
