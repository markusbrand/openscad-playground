# Best Practices & Architecture

This document outlines the architectural decisions, security standards, and coding practices followed in the OpenSCAD Playground project.

## Architecture

### Backend: FastAPI vs. Flask
The project utilizes **FastAPI** for the backend services. Decisions for FastAPI over alternatives like Flask:
- **Asynchronous Support**: Essential for streaming LLM responses (SSE) without blocking worker threads.
- **Pydantic Integration**: Automatic request validation and OpenAPI documentation generation via Pydantic models.
- **Performance**: High-performance execution on par with Node.js and Go.

### Frontend: React + Vite
- **Vite**: Chosen for near-instant hot module replacement (HMR) and optimized production builds.
- **Material UI (MUI)**: Provides a consistent, accessible, and responsive design system.
- **State Management**: Uses a custom `Model` class for centralizing application state and logic, ensuring a clear separation between UI components and business logic.

## Security Standards

### Input Validation
- **Strict Typing**: All API request bodies are validated against Pydantic schemas.
- **Literal Providers**: API key configuration is restricted to an allowlist of known providers (`gemini`, `openai`, `anthropic`, `mistral`).
- **SSRF Protection**: `OLLAMA_BASE_URL` and other internal service URLs are validated to prevent Server-Side Request Forgery by restricting them to trusted hosts (defaulting to `localhost` or `127.0.0.1`).

### Rate Limiting
- **Endpoint Protection**: Rate limits are enforced on expensive or sensitive endpoints (LLM chat, auto-debug, API key management) using `slowapi`.
- **Default Limits**:
    - `/chat/stream`: 5 requests per minute.
    - `/config/api-keys`: 10 requests per minute.

### Error Handling
- **Sanitized Responses**: Backend exceptions are caught and sanitized. Internal details (tracebacks, internal service errors) are logged server-side, while clients receive generic, friendly error messages to prevent information disclosure.

## Coding Standards

### Python (Backend)
- Use **Type Hints** for all function signatures.
- Prefer **Pydantic v2** for configuration and data modeling.
- Follow **PEP 8** style guidelines.

### TypeScript (Frontend)
- Use **Functional Components** and **Hooks**.
- Ensure all components are properly typed.
- Keep components small and focused; extract reusable logic into hooks or utility functions.

## Testing Strategy

- **Backend**: Use `pytest` for unit and integration tests. Ensure security controls (rate limiting, validation) have regression tests.
- **Frontend/E2E**: Use `Playwright` for end-to-end testing of core user journeys.
