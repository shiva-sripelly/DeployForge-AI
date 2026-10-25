# DeployForge AI

> Enterprise AI-powered Forward Deployment Platform for intelligent solution architecture, multi-tenant SaaS, AI agents, workflow automation, system integrations, and production operations.

DeployForge AI is an enterprise platform that helps forward-deployed engineers turn customer
requirements into secure, deployable AI-powered solutions.

This repository contains **Phase 1: the enterprise application foundation**. It includes
multi-tenant organizations and workspaces, tenant-aware authorization, an audit trail, a
production-style API, and a React console wired to live data. The AI capabilities
(Solution Architect, Agent Studio, workflow engine) are deliberately **not** implemented yet;
their pages in the console describe what is planned and show no metrics.

---

## Contents

- [What Phase 1 delivers](#what-phase-1-delivers)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Quick start (Docker)](#quick-start-docker)
- [Local development without Docker](#local-development-without-docker)
- [Configuration](#configuration)
- [Database migrations](#database-migrations)
- [Testing](#testing)
- [Cloud deployment and public demo](#cloud-deployment-and-public-demo)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What Phase 1 delivers

| Area | Implemented |
| --- | --- |
| **Tenancy** | Organizations (tenants), workspaces, organization and workspace memberships with roles |
| **Authorization** | JWT bearer authentication on every tenant endpoint; role checks; cross-tenant access returns 404 |
| **Audit trail** | Organization and workspace creation and token issuance are recorded atomically with the change |
| **API** | Versioned REST API (`/api/v1`), health and readiness probes, consistent error envelope, request IDs |
| **Console** | Responsive React UI: dashboard, customers, workspaces (list, create, detail), monitoring, settings, light/dark themes |
| **Operations** | Docker Compose stack, Alembic migrations, structured JSON logging, GitHub Actions CI |

In the console, **Customers** maps to organizations: each customer is an isolated tenant, and
each engagement or solution for that customer is a **workspace**.

## Architecture

```
┌────────────────────┐      /api/*       ┌──────────────────────┐      SQL      ┌──────────────┐
│ React SPA (nginx)  │ ────────────────▶ │ FastAPI (uvicorn)    │ ────────────▶ │ PostgreSQL   │
│ Vite · TanStack Q. │   same origin     │ services · authz     │  SQLAlchemy   │ 17           │
└────────────────────┘                   └──────────────────────┘               └──────────────┘
```

A modular monolith, by design: one API service, one database, and clear internal layers.

```
backend/app/
├── api/            HTTP layer: routers, dependencies (auth, pagination, request context)
├── services/       Business logic: organizations, workspaces, authorization, audit
├── models/         SQLAlchemy 2.x ORM models (UUID keys, timestamps, constraints)
├── schemas/        Pydantic v2 request/response models
├── core/           Settings, structured logging, error handling, token security
├── db/             Engine/session management and declarative base
└── scripts/        Development seed data
frontend/src/
├── api/            Typed endpoint functions and TanStack Query hooks
├── components/     Design-system primitives (ui/) and app shell (layout/)
├── features/       Feature components (create dialogs, roadmap placeholders)
├── pages/          Route screens
├── providers/      Auth, theme and active-organization context
└── styles/         Tailwind v4 design tokens (light and dark)
```

The full design notes, including the data model and authorization matrix, are in
[docs/architecture.md](docs/architecture.md).

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Axios, Lucide React |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, PyJWT, psycopg 3 |
| Database | PostgreSQL 17 |
| Testing | Pytest (against real PostgreSQL), Vitest, React Testing Library, MSW |
| Infrastructure | Docker, Docker Compose, nginx (unprivileged), GitHub Actions |

## Quick start (Docker)

Prerequisites: Docker with Compose v2.

```bash
cp .env.example .env          # local-development placeholders; edit if you like
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| Web console | http://localhost:8080 |
| API | http://localhost:8000/api/v1 |
| API docs (OpenAPI) | http://localhost:8000/api/docs (disabled when `ENVIRONMENT=production`) |
| PostgreSQL | `127.0.0.1:5433` (user/db `deployforge`) |

On startup the backend applies migrations automatically. With `SEED_DEV_DATA=true` (the default
in `.env.example`) it also creates a sample tenant and three accounts:

| Account | Access |
| --- | --- |
| `admin@deployforge.dev` | Owner of *Northwind Health*, admin of both workspaces |
| `engineer@deployforge.dev` | Member of *Northwind Health*, editor of one workspace only |
| `outsider@deployforge.dev` | No memberships: demonstrates tenant isolation |

Sign in on the console with one of these addresses. These accounts have no passwords. They
can only obtain tokens through the development token endpoint, which the API refuses to enable
in production.

Common commands:

```bash
docker compose ps                         # service status and health
docker compose logs -f backend            # structured JSON logs
docker compose exec backend alembic current
docker compose down                       # stop (data is kept in the postgres_data volume)
docker compose down -v                    # stop and delete the database volume
```

All published ports bind to `127.0.0.1`, so the stack is not reachable from other machines.

## Local development without Docker

Run PostgreSQL however you prefer. The simplest option is the Compose database only:
`docker compose up -d db`.

**Backend** (Python 3.12+):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
python -m app.scripts.seed_dev         # optional demo data
uvicorn --factory app.main:create_app --reload --port 8000
```

**Frontend** (Node 22+):

```bash
cd frontend
npm ci
npm run dev                            # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so no CORS setup is needed.

> Use `127.0.0.1` rather than `localhost` in local database URLs. On some systems `localhost`
> resolves to IPv6 first and stalls, because Docker publishes the port on IPv4 only.

## Configuration

All configuration comes from environment variables, validated at startup by
[`app/core/config.py`](backend/app/core/config.py).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test`, `staging` or `production` |
| `DATABASE_URL` | *required* | SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@host:5432/db` |
| `JWT_SECRET_KEY` | *required* | HMAC signing key, at least 32 characters (48+ and non-placeholder in production) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime (5–1440) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `DEV_AUTH_ENABLED` | `false` | Mounts `POST /api/v1/auth/dev/token`; **rejected in production** |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `json` | Logging verbosity; `json` or human-readable `console` |
| `DATABASE_POOL_SIZE` / `DATABASE_MAX_OVERFLOW` | `5` / `10` | Connection pool sizing |
| `DATABASE_SSL_MODE` | *unset* | libpq `sslmode`; production requires `require`, `verify-ca` or `verify-full` |
| `DATABASE_SSL_ROOT_CERT` | *unset* | CA bundle path for `verify-ca` / `verify-full` |
| `DATABASE_DISABLE_PREPARED_STATEMENTS` | `false` | Set `true` behind transaction-mode poolers (e.g. Supabase port 6543) |
| `DATABASE_POOL_RECYCLE_SECONDS` / `DATABASE_CONNECT_TIMEOUT_SECONDS` | `1800` / `10` | Connection recycling and connect timeout |
| `PORT` | `8000` | Port the container listens on (Render injects it) |

Compose-only variables (`POSTGRES_*`, `SEED_DEV_DATA`, `*_HOST_PORT`) are documented in
[`.env.example`](.env.example). Frontend build variables are in
[`frontend/.env.example`](frontend/.env.example). Anything prefixed `VITE_` ends up in the
browser bundle, so it must never contain secrets.

When `ENVIRONMENT=production` the API **refuses to start** if `JWT_SECRET_KEY` or
`DATABASE_URL` is missing, development auth is on, the JWT key is short or looks like a
placeholder, `CORS_ORIGINS` is empty or contains anything other than explicit non-local
`https://` origins, the database connection is not TLS-encrypted, or SQL echo is enabled.
Configuration errors name the offending variable but never echo its value. OpenAPI docs are
disabled in production. Plain `postgresql://` URLs (as copied from Supabase) are accepted and
mapped to the installed psycopg 3 driver.

## Database migrations

Migrations live in [`backend/alembic/versions`](backend/alembic/versions). The database URL is
read from `DATABASE_URL`, never from `alembic.ini`.

```bash
cd backend
alembic upgrade head                                  # apply all migrations
alembic downgrade -1                                  # roll back one revision
alembic current                                       # show the applied revision
alembic revision --autogenerate -m "describe change"  # generate after editing models
```

Migration `0002` enables row-level security (deny by default) on every table, so hosted
providers' auto-generated REST APIs (for example Supabase's, which uses public keys) cannot read
any rows. The API connects as the table owner and is unaffected. New tables must enable RLS
too; `test_every_table_has_row_level_security_enabled_but_not_forced` enforces this.

Always review autogenerated migrations. The test suite fails if the models and migrations
drift apart (`test_models_match_migrations`), and it checks that a full downgrade and upgrade
round-trip works.

## Testing

**Backend:** 142 tests that run against a real PostgreSQL database. The schema is built by
running the Alembic migrations, and each test runs inside a rolled-back transaction.

```bash
docker compose up -d db                 # or point TEST_DATABASE_URL at any PostgreSQL
cd backend
pytest                                  # creates the deployforge_test database if missing
pytest --cov=app                        # with coverage
ruff check . && ruff format --check .
```

The suite covers health and readiness (including database outage), database connectivity,
migration integrity, model constraints and tenant-isolation foreign keys, request validation,
authentication (expired, forged, unsigned, wrong audience, inactive user), the role- and
tenant-based authorization boundaries, the error envelope, production-config safety, hosted
PostgreSQL connection options (TLS, poolers), row-level security, and the production
authentication boundary.

**Frontend:** 54 tests using Vitest, React Testing Library and MSW (mocked HTTP at the network
layer), split into two projects: `full` (the console with sign-in) and `demo` (compiled as the
public read-only demo).

```bash
cd frontend
npm test            # rendering, navigation, auth flow, dashboard data, create flows, error handling
npm run lint
npm run typecheck
npm run build && npm run check:bundle
VITE_API_BASE_URL=https://api.example.com/api/v1 npm run build:demo && npm run check:bundle -- --public
```

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs five jobs on every pull
request and on `main`:

| Job | What it checks |
| --- | --- |
| Security configuration | No committed env files or credential-like strings; safe Render, Vercel and Compose settings ([script](scripts/ci/check_security_config.py)) |
| Backend | Ruff lint and format, migrations on a fresh database, seed idempotency, pytest with coverage |
| Frontend | ESLint, TypeScript, both test projects, both production builds, and bundle checks proving the public build has no development sign-in code |
| Backend container | The real Docker image refuses unsafe production config, binds Render's `PORT`, and rejects anonymous access ([script](scripts/ci/container_smoke_test.sh)) |
| Docker Compose | Both local images build |

## Cloud deployment and public demo

The public deployment uses **Vercel** (frontend), **Render** (API) and **Supabase**
(PostgreSQL), all on free tiers. The step-by-step guide, environment variable reference,
verification checklist, troubleshooting and rollback procedures are in
[docs/deployment/CLOUD_DEPLOYMENT.md](docs/deployment/CLOUD_DEPLOYMENT.md).

Because Phase 1 has only development authentication, the public site is a **read-only demo**:

- `npm run build:demo` compiles the console with `__DEMO_MODE__`. It renders the same pages
  with **synthetic data bundled in the browser** and never calls a protected endpoint. Only the
  public health endpoints are live, which shows real Render and Supabase connectivity.
- The development sign-in page, seeded account list and token handling are **compiled out** of
  that bundle; `npm run check:bundle -- --public` fails the build if they reappear.
- **The backend is the security boundary, not the frontend.** In production, dev token issuance
  is refused by configuration, so no token can be obtained and every protected endpoint
  returns 401 to the public.
- [`render.yaml`](render.yaml) and [`frontend/vercel.json`](frontend/vercel.json) hold the
  platform configuration; secrets are entered in the platform dashboards, never committed.

## API reference

Interactive documentation is served at `/api/docs` outside production. Phase 1 endpoints:

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/v1/health/live` | Public: process liveness |
| `GET` | `/api/v1/health/ready` | Public: database readiness (503 when not ready) |
| `POST` | `/api/v1/auth/dev/token` | Development only: token for an existing active account |
| `GET` | `/api/v1/auth/me` | Authenticated |
| `POST` | `/api/v1/organizations` | Authenticated; caller becomes owner |
| `GET` | `/api/v1/organizations` | Authenticated; only organizations the caller belongs to |
| `GET` | `/api/v1/organizations/{id}` | Organization member |
| `GET` | `/api/v1/organizations/{id}/stats` | Organization member |
| `GET` | `/api/v1/organizations/{id}/audit-logs` | Organization owner or admin |
| `POST` | `/api/v1/organizations/{id}/workspaces` | Organization owner or admin |
| `GET` | `/api/v1/organizations/{id}/workspaces` | Owners and admins see all workspaces; others see their own |
| `GET` | `/api/v1/workspaces/{id}` | Organization owner/admin or workspace member |
| `GET` | `/api/v1/workspaces/{id}/stats` | Organization owner/admin or workspace member |

List endpoints accept `limit` (1–100) and `offset`. Errors always use this shape:

```json
{ "error": { "code": "permission_denied", "message": "...", "details": null, "request_id": "..." } }
```

## Security model

- **No anonymous access to tenant data.** Every organization and workspace endpoint requires a
  valid JWT. The token's signature, expiry, issuer and audience are all verified, and the user
  must exist and be active.
- **Tenant isolation at two levels.** The API returns 404 for any resource outside the caller's
  tenants, so other tenants' IDs cannot be probed. In the database, composite foreign keys
  ensure that a workspace membership always refers to a workspace in the same organization and
  to a user who is a member of that organization.
- **Audit trail.** Audited actions are written in the same transaction as the change. Audit rows
  survive deletion of the actor or resource (`ON DELETE SET NULL`).
- **Development auth is fenced off.** It is disabled by default, refused in production,
  mounted only when enabled, never creates accounts, and is reachable only on loopback in the
  Compose stack.
- **Hosted database hardening.** Production requires TLS to PostgreSQL (`verify-full`
  supported) and every table has row-level security enabled, so a provider's REST API with
  public keys cannot read data.
- **Hardened defaults.** Containers run as non-root. nginx sends a strict CSP and security
  headers. The API sets `nosniff`, `DENY` framing and `no-store` caching, and returns a generic
  500 response without internal details. Access tokens are kept in `sessionStorage`, so they
  are scoped to one browser tab.

## Known limitations

- **Authentication is development-grade.** There are no passwords, SSO or MFA yet: tokens come
  from the dev endpoint for seeded accounts. Phase 2 adds OIDC/SAML SSO and token revocation.
- **Membership management is not exposed.** There are no APIs for inviting members, changing
  roles, archiving workspaces or deleting organizations. Memberships are created at org or
  workspace creation and by the seed script.
- **Access tokens are stateless and cannot be revoked** before they expire (60 minutes by
  default).
- **The audit log is append-only by convention.** The application never updates or deletes
  audit rows, but database-level immutability (grants or triggers) is not yet enforced.
- **No rate limiting** on the API. Locally the dev token endpoint is mitigated by loopback-only
  binding; in production it does not exist. Public endpoints are limited to health checks.
- **Free-tier hosting.** The Render free instance sleeps after inactivity (the first request
  can take about a minute), and Supabase pauses inactive free projects.
- **Synchronous database access.** FastAPI runs the sync SQLAlchemy endpoints in a threadpool.
  This is adequate for Phase 1 load and can move to async if profiling warrants it.

## Roadmap

| Phase | Theme | Highlights |
| --- | --- | --- |
| **1 · Foundation** ✅ | Platform core | Tenancy, workspaces, authorization, audit trail, console, CI |
| **2 · Identity & access** | Enterprise auth | OIDC/SAML SSO, invitations, role management UI, API keys, token revocation, PostgreSQL row-level security |
| **3 · Requirements intelligence** | AI Solution Architect | Requirement capture, generated reference architectures, risk and compliance checklists, human approval |
| **4 · Integrations & workflows** | Connect and orchestrate | Connector catalog, external secrets management, versioned workflows with approval steps |
| **5 · Agents & evaluation** | AI Agent Studio | Least-privilege agent tools, evaluation suites, prompt/model versioning |
| **6 · Delivery & operations** | Ship and run | Environment promotion, rollbacks, solution telemetry, incident management |
