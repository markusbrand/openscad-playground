"""Local development server: binds to BACKEND_PORT from .env (default 8000)."""

from __future__ import annotations

import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.backend_port,
        reload=True,
    )
