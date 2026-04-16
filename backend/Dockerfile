FROM python:3.12-slim AS base

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runtime

COPY app/ app/
COPY prompts/ prompts/

RUN mkdir -p data \
    && adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app

EXPOSE 8000

USER appuser

# BACKEND_PORT from compose env_file (default 8000). Must match nginx upstream if you proxy by port.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000}"]
