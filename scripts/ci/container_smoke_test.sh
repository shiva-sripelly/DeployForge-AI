#!/usr/bin/env bash
# Smoke-tests the backend Docker image the way Render runs it.
#
#   IMAGE=deployforge-backend:ci \
#   SMOKE_DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db \
#   DOCKER_NETWORK=host \
#   scripts/ci/container_smoke_test.sh
#
# Verifies that the container
#   1. refuses to start with missing or unsafe production configuration,
#      without echoing secret values;
#   2. binds to the runtime PORT (Render injects PORT) on 0.0.0.0;
#   3. runs migrations, serves health/readiness, and keeps dev auth off by default.
set -euo pipefail

IMAGE="${IMAGE:-deployforge-backend:ci}"
NETWORK="${DOCKER_NETWORK:-host}"
DB_URL="${SMOKE_DATABASE_URL:?set SMOKE_DATABASE_URL}"
SECRET="$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64)"
ORIGIN="https://deployforge-ai.vercel.app"
CONTAINER="deployforge-smoke-$$"

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
die() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; exit 1; }

# expect_refusal <description> <expected log text> <forbidden text|-> [docker env args...]
expect_refusal() {
  local description="$1" expected="$2" forbidden="$3"
  shift 3
  local output
  if output="$(docker run --rm --network "$NETWORK" "$@" "$IMAGE" 2>&1)"; then
    die "$description: container started but should have refused"
  fi
  grep -qF -- "$expected" <<<"$output" || die "$description: expected '$expected' in output:\n$output"
  if [ "$forbidden" != "-" ] && grep -qF -- "$forbidden" <<<"$output"; then
    die "$description: output leaked a secret value"
  fi
  pass "$description"
}

echo "Fail-safe production configuration:"
expect_refusal "missing JWT_SECRET_KEY" "JWT_SECRET_KEY: Field required" - \
  -e ENVIRONMENT=production -e DATABASE_URL="$DB_URL"
expect_refusal "missing DATABASE_URL" "DATABASE_URL: Field required" - \
  -e ENVIRONMENT=production -e JWT_SECRET_KEY="$SECRET"
expect_refusal "short secret is reported but never echoed" "JWT_SECRET_KEY" "SentinelShortSecret" \
  -e ENVIRONMENT=production -e DATABASE_URL="$DB_URL" -e JWT_SECRET_KEY=SentinelShortSecret
expect_refusal "development auth in production" "DEV_AUTH_ENABLED must be false" - \
  -e ENVIRONMENT=production -e DATABASE_URL="$DB_URL" -e JWT_SECRET_KEY="$SECRET" \
  -e CORS_ORIGINS="$ORIGIN" -e DATABASE_SSL_MODE=require -e DEV_AUTH_ENABLED=true
expect_refusal "unencrypted database in production" "Database TLS is required" - \
  -e ENVIRONMENT=production -e DATABASE_URL="$DB_URL" -e JWT_SECRET_KEY="$SECRET" \
  -e CORS_ORIGINS="$ORIGIN"
expect_refusal "wildcard CORS in production" "CORS_ORIGINS" - \
  -e ENVIRONMENT=production -e DATABASE_URL="$DB_URL" -e JWT_SECRET_KEY="$SECRET" \
  -e CORS_ORIGINS='*' -e DATABASE_SSL_MODE=require

echo "Runtime PORT binding and defaults:"
docker run -d --name "$CONTAINER" --network "$NETWORK" \
  -e ENVIRONMENT=staging -e PORT=10000 -e DATABASE_URL="$DB_URL" \
  -e JWT_SECRET_KEY="$SECRET" -e CORS_ORIGINS="$ORIGIN" "$IMAGE" >/dev/null

probe() {  # probe <port> <method> <path> -> prints HTTP status, or "down"
  docker exec "$CONTAINER" python -c "
import sys, urllib.request, urllib.error
req = urllib.request.Request('http://127.0.0.1:$1$3', method='$2', data=b'{}' if '$2' == 'POST' else None,
                             headers={'Content-Type': 'application/json'})
try:
    print(urllib.request.urlopen(req, timeout=3).status)
except urllib.error.HTTPError as e:
    print(e.code)
except Exception:
    print('down')" 2>/dev/null || echo down
}

for _ in $(seq 1 30); do
  [ "$(probe 10000 GET /api/v1/health/ready)" = "200" ] && break
  sleep 2
done
[ "$(probe 10000 GET /api/v1/health/ready)" = "200" ] || { docker logs "$CONTAINER"; die "readiness on PORT=10000"; }
pass "serves readiness on PORT=10000 after migrations"
[ "$(probe 8000 GET /api/v1/health/live)" = "down" ] || die "should not listen on the default port 8000"
pass "does not listen on the default port when PORT is set"
[ "$(probe 10000 GET /api/v1/organizations)" = "401" ] || die "protected endpoint without token"
pass "protected endpoint rejects anonymous requests (401)"
[ "$(probe 10000 POST /api/v1/auth/dev/token)" = "404" ] || die "dev token endpoint should be absent by default"
pass "development token endpoint is absent unless explicitly enabled"
docker logs "$CONTAINER" 2>&1 | grep -q '"message": "app.startup"' || die "structured JSON startup log"
pass "emits structured JSON logs"

docker rm -f "$CONTAINER" >/dev/null
echo "Container smoke test passed."
