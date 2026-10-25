# Cloud Deployment — Vercel, Render and Supabase

This guide deploys DeployForge AI as a public, read-only demonstration:

| Layer | Platform | Source in this repo | Free tier |
| --- | --- | --- | --- |
| Frontend (public demo) | **Vercel** | [`frontend/`](../../frontend), [`frontend/vercel.json`](../../frontend/vercel.json) | Hobby |
| API | **Render** (Docker web service) | [`backend/Dockerfile`](../../backend/Dockerfile), [`render.yaml`](../../render.yaml) | Free instance |
| Database | **Supabase** PostgreSQL | [`backend/alembic/`](../../backend/alembic) | Free project |
| Verification | **GitHub Actions** | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | Free for public repos |

No paid services are required. **No credentials appear in this document or the repository.**
Every secret is entered in a platform dashboard.

> Platform dashboards change over time. If a label below differs slightly, look for the
> equivalent setting; the values to enter stay the same.

---

## Contents

1. [How the public deployment works](#1-how-the-public-deployment-works)
2. [Supabase setup](#2-supabase-setup)
3. [Render setup](#3-render-setup)
4. [Vercel setup](#4-vercel-setup)
5. [Environment variable reference](#5-environment-variable-reference)
6. [Database migration procedure](#6-database-migration-procedure)
7. [GitHub integration](#7-github-integration)
8. [CI/CD workflow](#8-cicd-workflow)
9. [Production verification checklist](#9-production-verification-checklist)
10. [Troubleshooting](#10-troubleshooting)
11. [Rollback](#11-rollback)

---

## 1. How the public deployment works

```
 Browser ──HTTPS──▶ Vercel (static SPA, demo build)
    │                   synthetic data bundled in the page
    │
    └──HTTPS──▶ Render: FastAPI container ──TLS──▶ Supabase session pooler ──▶ PostgreSQL
               (only /health/* is called            (IPv4, port 5432)
                by the public demo)
```

Phase 1 has **development-only authentication**. Exposing it publicly would let anyone sign in
as a seeded account, so the public deployment is a read-only demo instead:

- **Frontend.** Vercel runs `npm run build:demo`, which compiles the console with
  `__DEMO_MODE__ = true`.
  - Pages render the same UI from **synthetic in-browser data** (fictional organizations, and
    `example.com` addresses).
  - All write actions are disabled. The dev sign-in page, seeded accounts and token handling
    are removed from the bundle.
  - The build then runs `npm run check:bundle -- --public` and fails if any of that code
    reappears.
- **Live data.** The only live calls are the public `GET /api/v1/health/live` and
  `/health/ready`. They prove the browser → Render → Supabase path works.
- **Backend.** Production configuration rejects `DEV_AUTH_ENABLED=true`, so the token
  endpoint is not even mounted. No token can be obtained, and every organization and workspace
  endpoint returns `401`. **The backend enforces this independently of the frontend.**
- **Database.** All tables have row-level security enabled (migration `0002`). Supabase's
  auto-generated REST API, which uses public keys, therefore cannot read any rows.
- **No AI services.** Phase 1 has no AI integrations, so no AI API keys exist and none can be
  used or exposed.

**Stable public URLs.** Keep the same Vercel project and the same Render service across phases.
The production URLs (`https://<project>.vercel.app` and `https://<service>.onrender.com`) then
never change. A custom domain can be added to either later without code changes.

**Deployment order:** Supabase → Render → Vercel. Each step needs a value from the one before.

---

## 2. Supabase setup

### 2.1 Create the project

1. Sign in at <https://supabase.com/dashboard> and choose **New project**.
2. **Name:** `deployforge-ai`. **Region:** East US (North Virginia), `us-east-1`. This matches
   the Render region `virginia` in [`render.yaml`](../../render.yaml). If you pick another
   region, change the Render region to the nearest one.
3. **Database password:** use the generator and store the password in a password manager.
   Never paste it into code, issues or chat.
4. **Plan:** Free.

### 2.2 Disable the Data API (defense in depth)

DeployForge talks to PostgreSQL directly through SQLAlchemy. It does **not** use Supabase's
REST/GraphQL Data API. Turn it off so it cannot serve your tables:

- **Project Settings → Data API**: disable the Data API. If disabling is not offered, remove
  `public` from **Exposed schemas**.

Migration `0002` already enables row-level security on every table. With no policies defined,
Supabase's `anon` and `authenticated` roles see no rows even if the Data API stays on. This
setting adds a second layer.

### 2.3 Get the connection string (session pooler)

Open **Connect** (top of the project dashboard) and choose **Session pooler**:

```
postgresql://postgres.<project-ref>:<YOUR-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Copy the host exactly as shown; it may start with `aws-0-` or `aws-1-`.

| Connection method | Use it? | Why |
| --- | --- | --- |
| **Session pooler** (port 5432, IPv4 and IPv6) | ✅ **Yes**, for Render and migrations | Works over IPv4 and supports prepared statements. Suited to a long-running server. |
| Direct connection (`db.<ref>.supabase.co`) | ❌ No | IPv6-only on the free plan (IPv4 is a paid add-on). Render cannot reach it. |
| Transaction pooler (port 6543) | ⚠️ Only if needed | No prepared statements: set `DATABASE_DISABLE_PREPARED_STATEMENTS=true`. Meant for serverless. |

Notes:

- The username for pooler connections is **`postgres.<project-ref>`**, not `postgres`.
- If the password contains URL-reserved characters (`@ : / ? # [ ] %` and so on),
  percent-encode them, or regenerate a password without them.
- A plain `postgresql://` URL is fine: the API converts it to the installed psycopg 3 driver.

### 2.4 TLS

Production refuses to start without an encrypted database connection.

- **Baseline (required):** `DATABASE_SSL_MODE=require`. This encrypts the connection; it is
  already set in [`render.yaml`](../../render.yaml).
- **Recommended:** `verify-full`, which also verifies the server certificate and hostname.
  1. In Supabase, open **Database Settings → SSL Configuration** and download the CA
     certificate.
  2. In Render, open **Environment → Secret Files** and add a file named `supabase-ca.crt`
     containing the certificate. Render mounts it at `/etc/secrets/supabase-ca.crt`.
  3. Set `DATABASE_SSL_MODE=verify-full` and
     `DATABASE_SSL_ROOT_CERT=/etc/secrets/supabase-ca.crt`.
- Optionally enable **Enforce SSL on incoming connections** in the same Supabase settings
  section.

### 2.5 Data

The production database starts **empty**. Migrations create the schema only. Development
data is never copied: the seed script refuses to run when `ENVIRONMENT=production`, and
`SEED_DEV_DATA` is `false` in the Blueprint. The public demo's sample data lives in the
frontend bundle, not in Supabase.

---

## 3. Render setup

### 3.1 Create the service from the Blueprint (recommended)

1. Sign in at <https://dashboard.render.com> with GitHub, and grant access to the
   `DeployForge-AI` repository.
2. Choose **New → Blueprint**, select the repository, and use the branch **`main`**. Render
   reads [`render.yaml`](../../render.yaml).
3. Render prompts for the three `sync: false` values:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase session-pooler string from §2.3 |
   | `JWT_SECRET_KEY` | Output of `python -c "import secrets; print(secrets.token_urlsafe(48))"` (64 characters; generate a new one, never reuse the dev value) |
   | `CORS_ORIGINS` | Your Vercel production URL, e.g. `https://deployforge-ai.vercel.app`. Use the expected URL now and correct it after §4 if Vercel assigns a different one. |

4. Apply the Blueprint. The first deploy builds the image, validates configuration, runs
   `alembic upgrade head` against Supabase, and starts the API.

### 3.2 Exact service settings

If you create the service manually instead (**New → Web Service**), use exactly these:

| Setting | Value |
| --- | --- |
| Name | `deployforge-api` (the URL becomes `https://deployforge-api.onrender.com`; Render appends a suffix if the name is taken) |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Root directory | *(leave empty)* |
| Docker build context directory | `backend` |
| Dockerfile path | `backend/Dockerfile` |
| Docker command | *(leave empty; the image's command honors `PORT`)* |
| Instance type | Free |
| Region | Virginia (or nearest to your Supabase region) |
| Health check path | `/api/v1/health/ready` |
| Auto-Deploy | **After CI checks pass** |
| Environment variables | All variables in §5.1 |

How the container satisfies Render's requirements:

- **Port.** Render injects `PORT`. The image runs
  `uvicorn --host 0.0.0.0 --port "${PORT}"`, which CI's container smoke test verifies.
- **Startup order.** [`docker-entrypoint.sh`](../../backend/docker-entrypoint.sh) validates
  configuration first (`python -m app.core.config`), then runs migrations, then starts the API.
  Missing or unsafe configuration stops the deploy before anything touches the database.
- **Health check.** `/api/v1/health/ready` returns `200` only when the database answers.
  Render keeps the previous deploy live until the new one is ready.

### 3.3 Free-tier behavior

- The instance **sleeps after about 15 minutes without traffic**. The next request wakes it,
  which takes about a minute. The demo's status indicator retries for about a minute before
  showing "API offline".
- Render's pre-deploy command is not available on the free instance type, so migrations run at
  container start. This is safe with one instance, because Alembic migrations are idempotent
  and run in a transaction. On a paid plan, move `alembic upgrade head` to a pre-deploy command
  and set `RUN_MIGRATIONS=false`.

---

## 4. Vercel setup

1. Sign in at <https://vercel.com> with GitHub, and choose **Add New → Project**. Import
   `DeployForge-AI`.
2. Configure the project:

   | Setting | Value |
   | --- | --- |
   | Project name | `deployforge-ai` (production URL `https://deployforge-ai.vercel.app` if available) |
   | Framework preset | Vite (also set by `vercel.json`) |
   | **Root directory** | **`frontend`** |
   | Build command | *(from `vercel.json`)* `npm run build:demo && npm run check:bundle -- --public` |
   | Output directory | *(from `vercel.json`)* `dist` |
   | Install command | *(from `vercel.json`)* `npm ci` |
   | Node.js version | 22.x (**Settings → Build and Deployment**) |

3. **Environment Variables** (*Production* and *Preview*):

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api/v1` |

   This value is public. It is compiled into the JavaScript bundle and is not a secret. **Never
   add database URLs, JWT secrets or Supabase keys to Vercel.** The build refuses `http://`,
   localhost, or relative values for the demo.

4. Deploy. Then confirm **Settings → Git → Production Branch** is `main`.
5. If the assigned production URL is not the one you entered for `CORS_ORIGINS` in §3.1,
   update `CORS_ORIGINS` on Render. Render redeploys automatically.

What [`vercel.json`](../../frontend/vercel.json) provides:

- **SPA fallback.** Every non-asset path rewrites to `index.html`, so refreshing
  `/workspaces/...` works.
- **Security headers.** `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions
  policy, and a CSP with `frame-ancestors 'none'`. The build adds a CSP `<meta>` tag that
  limits `connect-src` to the page and the Render API origin.
- **Caching.** Immutable, long-lived caching for fingerprinted `/assets/*`.

**Preview deployments.** Pull requests get preview URLs (`*-git-<branch>-*.vercel.app`).
These are never production. Previews work fully except the live status card, because the
production API's CORS allows only the production origin. That restriction is intentional.

---

## 5. Environment variable reference

### 5.1 Backend (Render)

| Variable | Required | Render value | Purpose |
| --- | --- | --- | --- |
| `ENVIRONMENT` | yes | `production` | Enables production safety checks; disables OpenAPI docs |
| `DATABASE_URL` | **secret** | Supabase session pooler URL | PostgreSQL connection (`postgresql://` accepted) |
| `JWT_SECRET_KEY` | **secret** | 48+ random characters | Token signing key; placeholders are rejected |
| `CORS_ORIGINS` | yes | `https://<project>.vercel.app` | Comma-separated explicit `https://` origins; `*`, `http://` and localhost are rejected |
| `DEV_AUTH_ENABLED` | yes | `false` | Must be false in production (enforced) |
| `SEED_DEV_DATA` | yes | `false` | Never seed production (the seed script also refuses) |
| `RUN_MIGRATIONS` | — | `true` | Run `alembic upgrade head` at container start |
| `DATABASE_SSL_MODE` | yes | `require` (or `verify-full`) | Production requires an encrypting mode |
| `DATABASE_SSL_ROOT_CERT` | for `verify-*` | `/etc/secrets/supabase-ca.crt` | CA certificate path |
| `DATABASE_POOL_SIZE` | — | `3` | Persistent connections per instance |
| `DATABASE_MAX_OVERFLOW` | — | `2` | Burst connections (keeps total within free pooler limits) |
| `DATABASE_POOL_RECYCLE_SECONDS` | — | `300` | Recycle before pooler idle timeouts |
| `DATABASE_CONNECT_TIMEOUT_SECONDS` | — | `10` | Fail fast when the database is unreachable |
| `DATABASE_DISABLE_PREPARED_STATEMENTS` | — | *(unset)* | `true` only with the transaction pooler (port 6543) |
| `FORWARDED_ALLOW_IPS` | — | `*` | Trust Render's proxy for client IPs in audit logs |
| `LOG_LEVEL` / `LOG_FORMAT` | — | `INFO` / `json` | Structured logs in Render's log viewer |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | — | `60` | Token lifetime |
| `PORT` | — | *(injected by Render)* | Listening port |

### 5.2 Frontend (Vercel)

| Variable | Where | Value | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Vercel dashboard | `https://<service>.onrender.com/api/v1` | API base URL compiled into the bundle (public) |
| `VITE_APP_MODE` | [`frontend/.env.demo`](../../frontend/.env.demo) (committed) | `demo` | Selects the read-only demo build; not set in the dashboard |

### 5.3 Where each value lives

| Value | Supabase | Render | Vercel | GitHub |
| --- | :-: | :-: | :-: | :-: |
| Database password / `DATABASE_URL` | source | ✅ secret | ❌ never | ❌ never |
| `JWT_SECRET_KEY` | — | ✅ secret | ❌ never | ❌ never |
| Supabase anon/service keys | source | ❌ not used | ❌ not used | ❌ never |
| `VITE_API_BASE_URL` | — | — | ✅ public | — |

---

## 6. Database migration procedure

**Automatic (default).** Every Render deploy runs `alembic upgrade head` before the API starts.
If a migration fails, the container exits, the deploy is marked failed, and **the previous
version keeps serving traffic**.

**Rules for safe production migrations:**

1. Migrations are reviewed in a pull request and pass CI. CI applies them to a fresh database,
   checks that models match migrations, and performs a full downgrade/upgrade round trip.
2. Make changes backward compatible (expand, then contract). The previous app version must keep
   working on the new schema, so a deploy can be rolled back without touching the database.
3. Every new table must enable row-level security (CI enforces this).
4. Back up before risky migrations (see below).
5. Never run `alembic downgrade` against production casually. Downgrading `0001` drops every
   table.

**Manual run from a trusted machine** (for example, to apply migrations before the first
deploy, or with `RUN_MIGRATIONS=false`). Use the same session-pooler URL. `JWT_SECRET_KEY` is
only needed to satisfy settings validation; any throwaway value of 32+ characters works and is
not used.

```bash
# bash
cd backend
export DATABASE_URL='postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
export DATABASE_SSL_MODE=require ENVIRONMENT=staging JWT_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
alembic current          # show the applied revision
alembic upgrade head     # apply pending migrations
unset DATABASE_URL JWT_SECRET_KEY
```

```powershell
# PowerShell
cd backend
$env:DATABASE_URL = 'postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
$env:DATABASE_SSL_MODE = 'require'; $env:ENVIRONMENT = 'staging'
$env:JWT_SECRET_KEY = python -c "import secrets;print(secrets.token_urlsafe(48))"
alembic current
alembic upgrade head
Remove-Item Env:DATABASE_URL, Env:JWT_SECRET_KEY
```

Don't put the production URL in `backend/.env`, where it is easy to leave behind, and don't
paste it into a shell that records history on a shared machine.

**Backup before risky changes.** The Supabase free plan does not include downloadable backups.
Use `pg_dump` (version 17 or newer):

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="deployforge-$(date +%Y%m%d%H%M).dump"
```

---

## 7. GitHub integration

1. **Install the apps.** Vercel and Render each install a GitHub App during sign-up. Grant
   access only to the `DeployForge-AI` repository.
2. **Protect `main`** (**Settings → Branches → Add branch protection rule**, or **Rules →
   Rulesets**) with branch name pattern `main`:
   - ✅ Require a pull request before merging. Set required approvals to 1, or 0 if you are the
     only maintainer, since GitHub doesn't let you approve your own pull request.
   - ✅ Require status checks to pass, and require branches to be up to date. Required checks:
     - `Security configuration`
     - `Backend (lint, migrations, tests)`
     - `Frontend (lint, types, tests, builds)`
     - `Backend container (Render runtime smoke test)`
     - `Docker Compose images build`
   - ✅ Block force pushes and branch deletion.
   - ✅ Do not allow bypassing the above settings.
3. **Enable secret protection:** **Settings → Code security**: enable *Secret scanning* and
   *Push protection* (free for public repositories).
4. Work on feature branches (for example `feature/phase-1-5-cloud-deployment`) and merge
   through pull requests only. Never push directly to `main`.

---

## 8. CI/CD workflow

```
feature branch ──push──▶ Pull request
                           │  GitHub Actions: 5 required checks
                           │  Vercel: preview deployment (never production)
                           ▼
                    review + all checks green
                           │ merge
                           ▼
                         main ──▶ GitHub Actions run again on main
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   Render: deploys after          Vercel: production build of main
   checks pass on the commit      (build:demo + public bundle check;
   (autoDeployTrigger:             a failing check fails the deploy)
    checksPass)
```

- **Only reviewed, CI-green changes reach production.** Branch protection means `main` only
  changes through pull requests whose checks pass. Render also waits for the checks on the
  merge commit itself.
- **Feature branches never deploy to production.** Render deploys only `main`. Vercel builds
  feature branches as previews, never as production.
- **Security checks in CI:**
  - The security configuration job blocks committed env files, credential-like strings, and
    unsafe `render.yaml`, `vercel.json` or Compose settings.
  - The public bundle check blocks dev sign-in code in the demo build.
  - The container smoke test verifies that the production image refuses unsafe configuration
    without echoing secrets.
- If Render's dashboard does not offer **After CI checks pass**, set Auto-Deploy to **On
  Commit**. Branch protection still guarantees that commits on `main` have passed CI.

---

## 9. Production verification checklist

Replace `API=https://<service>.onrender.com` and `WEB=https://<project>.vercel.app`. The first
request may take about a minute while the free instance wakes.

**API (Render)**

```bash
curl -s  $API/api/v1/health/live                    # {"status":"ok",...,"environment":"production"}
curl -s  $API/api/v1/health/ready                   # 200 {"status":"ready","checks":{"database":{"status":"ok",...}}}
curl -si $API/api/v1/organizations | head -1        # HTTP/... 401
curl -si -X POST $API/api/v1/auth/dev/token -H 'Content-Type: application/json' \
     -d '{"email":"admin@deployforge.dev"}' | head -1   # 404 (dev auth absent)
curl -si $API/api/docs | head -1                    # 404 (docs disabled)
curl -si $API/api/v1/health/live -H "Origin: $WEB" | grep -i access-control-allow-origin   # = $WEB
curl -si $API/api/v1/health/live -H "Origin: https://evil.example" | grep -ci access-control-allow-origin  # 0
```

- [ ] All commands above return the expected results.
- [ ] Render logs show `Configuration OK (environment=production)`, the Alembic upgrade, and
      a JSON `app.startup` line with `"dev_auth_enabled": false` and the expected
      `cors_origins` and `database_ssl_mode`.
- [ ] Render logs contain no database password or JWT secret.

**Database (Supabase SQL editor)**

```sql
select version_num from alembic_version;                       -- 0002
select relname, relrowsecurity from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r'; -- all true
select count(*) from users;                                    -- 0 (no dev data copied)
```

- [ ] The Data API is disabled (or `public` is not exposed).

**Frontend (Vercel)**

- [ ] `$WEB` shows the dashboard with the **Public demo** banner and "(Demo)" organizations.
- [ ] There is no sign-in page and no seeded account list; the top bar shows **Read-only**.
- [ ] "New organization" and "New workspace" are disabled.
- [ ] The status pill shows **API online**, and Monitoring shows the API as Live and PostgreSQL
      as Healthy.
- [ ] Refreshing `$WEB/workspaces` and `$WEB/settings` loads the page, not a 404.
- [ ] In DevTools → Network, the only requests to the API are `/health/live` and
      `/health/ready`.
- [ ] Response headers include `content-security-policy` and `x-frame-options: DENY`.
- [ ] The page source contains no `localhost` and no `deployforge.dev` addresses.

**Repository**

- [ ] All five GitHub Actions checks are green on `main`.
- [ ] `main` is protected as described in §7.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Render deploy fails with `Invalid configuration: ...` | A required variable is missing or unsafe; the message names it | Set or correct that variable. The message lists the problem but never echoes the value. |
| `Database TLS is required in production` | `DATABASE_SSL_MODE` unset | Set `require` (or `verify-full` with the CA file) |
| `CORS_ORIGINS entry ... must be an explicit non-local https origin` | `http://`, localhost, a trailing path, or `*` | Use exact origins like `https://deployforge-ai.vercel.app` |
| `Network is unreachable` / `failed to resolve host` | Direct connection host (IPv6-only) or a typo | Use the **Session pooler** string from §2.3 |
| `password authentication failed` | Username `postgres` instead of `postgres.<ref>`, or unencoded special characters | Copy the pooler string again; percent-encode the password |
| `prepared statement "..." already exists` | Using the transaction pooler (6543) | Use the session pooler (5432), or set `DATABASE_DISABLE_PREPARED_STATEMENTS=true` |
| `Max client connections reached` / too many connections | Pool too large or extra instances | Keep `DATABASE_POOL_SIZE=3`, `DATABASE_MAX_OVERFLOW=2` |
| `root certificate file ... does not exist` | `verify-full` without the CA file | Add the Secret File and `DATABASE_SSL_ROOT_CERT` (§2.4) |
| Health check fails after a deploy | Supabase unreachable, or the project is paused | Check Render logs; restore the paused Supabase project in its dashboard |
| Demo shows **API offline** at first | The free Render instance is waking up | Wait about a minute; it retries automatically |
| Demo stays **API offline**; console shows a CORS error | `CORS_ORIGINS` doesn't match the exact Vercel origin | Update `CORS_ORIGINS` on Render. Preview URLs are blocked on purpose. |
| Status shows "unexpected response" | `VITE_API_BASE_URL` points at the wrong host or path | Set it to `https://<service>.onrender.com/api/v1` and **redeploy** (it is compiled at build time) |
| Vercel build fails: `VITE_API_BASE_URL must be an absolute https:// URL` | Variable missing for that environment | Add it under Production (and Preview) |
| Vercel build fails: `Bundle check failed (public build)` | Development sign-in code reached the demo bundle | Ensure the code is guarded by `__DEMO_MODE__`; see the listed file and pattern |
| 404 when refreshing a deep link | Root directory not `frontend`, so `vercel.json` isn't applied | Set **Root Directory** to `frontend` and redeploy |
| Render waits forever for checks | Auto-Deploy set to checks, but CI isn't running on `main` | Confirm Actions are enabled, or switch Auto-Deploy to On Commit |

Render logs are JSON. Each request is logged as `request.completed`, with a `request_id` that
matches the `X-Request-ID` response header and the `request_id` in error bodies.

---

## 11. Rollback

Roll back the application first and fix forward in Git. Avoid database rollbacks unless data
is at risk.

**Frontend (Vercel).** **Deployments** → choose the last good production deployment → **⋯ →
Instant Rollback** (or **Promote to Production**). This takes effect immediately and needs no
rebuild.

**API (Render).** **Events** (or **Deploys**) → find the last good deploy → **Rollback**.
Render redeploys that image. Because migrations are backward compatible (§6), the previous API
version runs on the current schema.

**Code.** Revert the offending pull request through a new pull request (`git revert <merge-sha>`
on a branch, then open a PR). CI runs, and both platforms redeploy `main` automatically. Never
force-push `main`.

**Database.**

- Preferred: fix forward with a new migration.
- If a migration must be undone, review its `downgrade()` first and confirm it is
  non-destructive. Then run `alembic downgrade -1` manually (§6), and redeploy an app version
  compatible with that schema.
- Data loss or corruption: restore from your latest `pg_dump` with
  `pg_restore --clean --no-owner -d "$DATABASE_URL" <file>.dump`.

**Emergency stop.** Render → service → **Suspend**: the API stops and the demo shows
"API offline". Vercel → **Settings → Deployment Protection**, or roll back to a known-good
build.

**Credential rotation** (if a secret may have leaked):

1. Supabase → **Database Settings → Reset database password**, then update `DATABASE_URL` on
   Render.
2. Generate a new `JWT_SECRET_KEY` on Render. All existing tokens become invalid immediately.
3. Review Render logs and the `audit_logs` table for unexpected activity.
