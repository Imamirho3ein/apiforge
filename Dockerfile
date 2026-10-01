# syntax=docker/dockerfile:1
#
# APIForge — single image for the whole product.
#   Stage 1  builds the React SPA with Node
#   Stage 2  installs the Python dependencies
#   Stage 3  runtime: daphne (ASGI) answers /api, /ws, /gateway and the SPA
#
# The build context is the repository root so that Liara (`liara deploy`),
# docker compose and CI all use this one file.
#
#   docker build -t apiforge .
#   docker run -p 8000:8000 apiforge

# --------------------------------------------------------------------------
# Stage 1 — frontend bundle
# --------------------------------------------------------------------------
FROM node:24-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
# `npm ci` needs the lockfile; fall back to `npm install` when it is absent.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./
RUN npm run build
# Sanity check: refuse to publish an image without an entry point.
RUN test -f dist/index.html

# --------------------------------------------------------------------------
# Stage 2 — python dependencies (compiled into a prefix we can copy)
# --------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# --------------------------------------------------------------------------
# Stage 3 — runtime
# --------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=8000

# Only the shared library psycopg needs at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 apiforge

COPY --from=builder /install /usr/local
COPY --chown=apiforge:apiforge backend/ /app/
COPY --from=frontend --chown=apiforge:apiforge /build/dist/ /app/static/spa/
COPY --chown=apiforge:apiforge docker/entrypoint.sh /app/entrypoint.sh
# Belt and braces: a CRLF shebang would make the image fail to start, and the
# file can arrive from a Windows checkout that ignores .gitattributes.
RUN chmod +x /app/entrypoint.sh && sed -i 's/\r$//' /app/entrypoint.sh

WORKDIR /app
USER apiforge

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health/" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["sh", "-c", "exec daphne -b 0.0.0.0 -p ${PORT} config.asgi:application"]
