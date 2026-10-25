#!/bin/sh
set -eu

# Fail fast, before touching the database, if configuration is missing or unsafe.
python -m app.core.config

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  alembic upgrade head
fi

if [ "${SEED_DEV_DATA:-false}" = "true" ]; then
  echo "Seeding development data..."
  python -m app.scripts.seed_dev
fi

exec "$@"
