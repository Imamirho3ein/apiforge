#!/bin/sh
set -e

echo "▸ APIForge starting (settings: ${DJANGO_SETTINGS_MODULE:-config.settings.production})"

# --------------------------------------------------------------------------
# Wait for PostgreSQL
# --------------------------------------------------------------------------
if [ -n "${DATABASE_URL}" ] || [ -n "${POSTGRES_HOST}" ]; then
    echo "▸ Waiting for the database…"
    python - <<'PY'
import os
import time

import psycopg

dsn = os.getenv("DATABASE_URL") or "postgres://{u}:{p}@{h}:{port}/{n}".format(
    u=os.getenv("POSTGRES_USER", "apiforge"),
    p=os.getenv("POSTGRES_PASSWORD", "apiforge"),
    h=os.getenv("POSTGRES_HOST", "db"),
    port=os.getenv("POSTGRES_PORT", "5432"),
    n=os.getenv("POSTGRES_DB", "apiforge"),
)

deadline = time.time() + 60
while time.time() < deadline:
    try:
        with psycopg.connect(dsn, connect_timeout=3):
            print("▸ Database is ready.")
            break
    except Exception:  # noqa: BLE001 - keep retrying until the deadline
        time.sleep(1.5)
else:
    echo "✗ Database did not become ready in time."
    exit 1
PY
fi

# --------------------------------------------------------------------------
# Migrations & static files
# --------------------------------------------------------------------------
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "▸ Applying migrations…"
    python manage.py migrate --noinput
fi

if [ "${COLLECT_STATIC:-true}" = "true" ]; then
    echo "▸ Collecting static files…"
    python manage.py collectstatic --noinput --clear >/dev/null
fi

if [ "${CREATE_SUPERUSER:-false}" = "true" ]; then
    echo "▸ Creating the superuser…"
    DJANGO_SUPERUSER_PASSWORD="${DJANGO_SUPERUSER_PASSWORD:-admin}" \
        python manage.py createsuperuser --noinput || echo "  (already exists)"
fi

if [ "${SEED_DEMO:-false}" = "true" ]; then
    echo "▸ Seeding demo data…"
    python manage.py seed_demo || echo "  (seed skipped)"
fi

echo "▸ Starting: $*"
exec "$@"
