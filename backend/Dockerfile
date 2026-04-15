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

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
