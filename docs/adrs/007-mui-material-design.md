# ADR 007: Migrate UI from PrimeReact to MUI (Material Design 3)

**Status:** Accepted  
**Date:** 2026-04-15

## Context

The app today uses **PrimeReact** and **PrimeFlex**. Project standards call for **Google Material Design**, including consistent components, motion, and accessibility patterns aligned with Material.

## Decision

Perform a **full migration to MUI** (`@mui/material`) with **Material Design 3** theming (typography, color roles, shape, and light/dark schemes as appropriate).

## Consequences

- **Positive:** **Consistent Material Design** look and behavior; access to a **large, well-maintained** component set; **light/dark** and theme tokens are first-class.
- **Negative / constraints:** **Non-trivial migration effort** for existing screens, layouts, and custom styling; team must relearn layout and styling idioms vs PrimeFlex.
- **Neutral:** Prime-specific assets and utilities are phased out; new UI work should default to MUI primitives and documented theme extensions.
