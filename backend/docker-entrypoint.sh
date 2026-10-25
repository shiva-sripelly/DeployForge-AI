#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  alembic upgrade head
fi

if [ "${SEED_DEV_DATA:-false}" = "true" ]; then
  echo "Seeding development data..."
  python -m app.scripts.seed_dev
fi

exec "$@"
