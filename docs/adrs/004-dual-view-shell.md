# ADR 004: Dual-view shell (chat / code + persistent 3D viewer)

**Status:** Accepted  
**Date:** 2026-04-15

## Context

The app must combine an **LLM chat** surface, an **OpenSCAD code editor**, and a **3D preview**. All three need to feel cohesive: code produced in chat should land in the editor, and the user should usually see geometry feedback without losing context.

## Decision

Adopt a **dual-view left panel** with a **persistent right panel**:

- **Left:** Two switchable views—**Chat** (default) and **Code**—only one primary left view visible at a time.
- **Right:** **3D viewer** always present (persistent).
- **Shared application state** so text generated or edited in chat flows into the editor (and vice versa according to product rules).

## Consequences

- **Positive:** **Clear separation of concerns** between conversational assistance and direct editing; the user can **always see the 3D result** while switching modes; **smooth transitions** between AI-assisted and manual workflows.
- **Negative / constraints:** Layout and responsive behavior must handle narrow viewports (e.g. stacking or collapsible panels); state management must stay disciplined to avoid desync between chat, editor, and preview.
- **Neutral:** Defaults favor chat-first onboarding while still privileging the preview as the “ground truth” for the model.
