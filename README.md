# APIForge

**APIForge** is an API management platform in the spirit of Kong / Stripe dashboard:
declare your APIs, issue scoped API keys, enforce rate limits, mock or proxy traffic,
and watch every request live.

Built as a portfolio project to demonstrate full-stack engineering: a
**Django 6 + Django REST Framework** backend with **Django Channels** websockets,
a **React 19 + TypeScript (Vite)** SPA, **PostgreSQL**, **Redis**, Docker and CI.

---

## Table of contents

- [Highlights](#highlights)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Using the gateway](#using-the-gateway)
- [API reference](#api-reference)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Design decisions](#design-decisions)

> 🇷🇩 **Persian speakers:** the full Liara deployment walkthrough (with `.ir`
> domain setup) is in [`docs/deployment-fa.md`](docs/deployment-fa.md).

---

## Highlights

| Feature | Where |
|---|---|
| JWT auth with rotating refresh tokens | `apps/accounts` |
| Projects & endpoints CRUD, tenant-isolated | `apps/apis` |
| API keys: SHA-256 hashed, one-time reveal, rotate/revoke | `apps/keys` |
| **Gateway**: API-key auth, rate limiting, mock **or** proxy, request logging | `apps/gateway` |
| Analytics: summary, time series, status distribution, top endpoints | `apps/analytics/services.py` |
| **Live request log over WebSockets** | `apps/analytics/consumers.py` |
| Cursor-paginated, searchable, filterable log explorer | `apps/analytics/views.py` |
| OpenAPI 3 schema + Swagger UI + ReDoc (generated without warnings) | `/api/schema/`, `/api/docs/` |
| 99 tests (auth, tenancy, gateway, analytics, realtime, SPA hosting) | `backend/tests/` |
| CI: ruff, Django checks, pytest on SQLite **and** PostgreSQL, frontend build, Docker build + smoke test | `.github/workflows/ci.yml` |
| One-command deploy to Liara with quality gates | `.github/workflows/deploy-liara.yml`, `docs/deployment-fa.md` |

## Architecture

```
                  ┌──────── React SPA (Vite) ────────┐        (dev)
                  │  Dashboard · Projects · Keys · Logs│
                  └───────────────┬──────────────────┘
                        HTTPS/JSON │ JWT                    WS  │ ?token=<jwt>
                  ┌───────────────▼─────────────────────────────▼──────────────┐
   control plane  │  daphne (ASGI)                                            │
                  │    ├── /api/*        DRF viewsets (JWT)                  │
                  │    ├── /api/schema/  drf-spectacular                      │
   data plane     │    ├── /ws/logs/     Channels consumer (live logs)        │
                  │    ├── /gateway/*    API-key gateway (mock | proxy)       │
   (single port)  │    └── /*            React shell + hashed assets           │
                  └───┬────────────────────────────────────┬──────────────────┘
                          │                                    │
                 ┌────────▼────────┐                  ┌────────▼────────┐
                 │  PostgreSQL 16  │                  │  Redis 7         │
                 │  source of      │                  │  rate limits     │
                 │  truth          │                  │  channel layer   │
                 └─────────────────┘                  └──────────────────┘
```

**Control plane** (`/api/*`) — JWT-protected management API.
**Data plane** (`/gateway/*`) — the public traffic plane, authenticated with an
API key instead of a JWT, rate limited per key, and every request recorded.

In development the SPA is served by Vite (with a proxy) while Django runs on
`:8000`. In a container the two are baked into one image: Django serves the
React shell through WhiteNoise, so a single ASGI process answers everything on
one port — the shape every PaaS (Liara, ArvanCloud, Render…) expects.

## Tech stack

**Backend** — Django 6.1, DRF 3.18, Django Channels 4.3, drf-spectacular,
django-filter, simplejwt, psycopg 3, httpx, daphne, pytest, ruff.

**Frontend** — React 19, TypeScript (strict), Vite 7, TanStack Query 5,
zustand 5, axios, Recharts 3, Tailwind CSS 4, lucide-react.

**Infrastructure** — PostgreSQL 16, Redis 7, Docker multi-stage builds,
GitHub Actions.

## Quick start

### Option A — local development (no Docker needed)

Requires **Python 3.12+** and **Node 20+**.

```bash
# 1. Backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt      # Windows: .venv\Scripts\pip install -r requirements-dev.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo               # demo data + printed API keys
.venv/bin/python manage.py runserver 8000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173 — Vite proxies /api, /gateway, /ws to :8000
```

No PostgreSQL? The backend falls back to SQLite automatically
(`backend/db.sqlite3`) — zero configuration.

Log in with the seeded account:

```
demo@apiforge.dev / DemoPass!234
```

API docs: <http://localhost:8000/api/docs/>

> **Network note.** If `pip install` fails with
> `Failed to resolve IP address for 'files.pythonhosted.org'`, your network
> blocks PyPI's file CDN. Point pip at a mirror for this install only:
> `$env:PIP_INDEX_URL='https://pypi.tuna.tsinghua.edu.cn/simple'` (PowerShell) —
> nothing in the repo needs to change.

### Option B — Docker Compose (full stack)

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| SPA + API (one port) | <http://localhost:8000> |
| Swagger UI | <http://localhost:8000/api/docs/> |
| Admin | <http://localhost:8000/admin/> |
| Health probe | <http://localhost:8000/api/health/> |

One image serves the SPA, the API, the gateway and the websocket endpoint on a
single port (`:8000`). Nothing else to configure.

```bash
docker compose exec app python manage.py seed_demo   # optional demo data
```

### Option C — Liara (Iranian PaaS)

```bash
npm install -g @liara/cli && liara login
liara create apiforge --platform docker --port 8000
liara db create apiforge-db --plan g5
liara redis create apiforge-redis --plan g5
liara env set DJANGO_SECRET_KEY="…" DATABASE_URL="…" REDIS_URL="…" SERVE_SPA=true
liara deploy --platform docker --port 8000 --app apiforge
```

**Full step-by-step guide (Persian): [`docs/deployment-fa.md`](docs/deployment-fa.md)** —
including `.ir` domain setup, automatic GitHub Actions deploys and troubleshooting.

## Environment variables

All configuration is environment driven (`backend/config/settings/`), so the same
image runs locally and in production. See `.env.example` for the full list.

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | *(dev fallback)* | **Required in production** |
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | `dev` / `production` / `test` |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated |
| `DATABASE_URL` | – | Any URL `dj-database-url` understands |
| `POSTGRES_HOST/PORT/DB/USER/PASSWORD` | – | Used when `DATABASE_URL` is empty |
| `REDIS_URL` | – | Enables shared rate limits + cross-worker websockets |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma separated |
| `GATEWAY_BASE_URL` | `http://localhost:8000` | Used to render `gateway_url` in the API |
| `ALLOW_PRIVATE_UPSTREAM` | `true` in DEBUG | SSRF guard for proxied targets |
| `SERVE_SPA` | auto | Serve the built React bundle from Django (single-container deploys) |
| `SEED_DEMO` | `false` | Seed demo data on container start |

Settings resolution is explicit and boring:

```
DATABASE_URL set?  ──►  Postgres (or whatever the URL says)
POSTGRES_HOST set? ──►  PostgreSQL
otherwise          ──►  SQLite
REDIS_URL set?     ──►  Redis channel layer + Redis cache
otherwise          ──►  In-memory channel layer + local memory cache
```

## Using the gateway

1. Create a project and an endpoint (mock mode is enough to start).
2. Issue an API key — the plaintext is returned **once**.
3. Call the public URL:

```bash
curl -H "X-API-Key: af_live_..." \
     http://localhost:8000/gateway/payments-api/charges
```

```json
{ "data": [], "has_more": false }
```

Successful responses carry gateway metadata:

| Header | Meaning |
|---|---|
| `X-Request-Id` | UUID of the stored `RequestLog` row |
| `X-Gateway-Latency-Ms` | Server-side processing time |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` | Quota of the calling key |

Errors are machine readable:

```json
{ "error": { "code": "rate_limited", "message": "Rate limit of 5 requests/minute exceeded." } }
```

| Code | Status |
|---|---|
| `api_key_required`, `invalid_api_key` | 401 |
| `key_revoked`, `key_expired`, `key_scope_mismatch` | 403 |
| `project_not_found`, `endpoint_not_found` | 404 |
| `rate_limited` | 429 (+ `Retry-After`) |
| `upstream_error` | 502 |
| `no_backend_configured` | 501 |

Switch an endpoint to **proxy mode** by setting `target_url`; the gateway then
forwards method, query, body and headers upstream with `httpx` and streams the
response back. Loopback/private targets are refused unless
`ALLOW_PRIVATE_UPSTREAM` is on (development only).

## API reference

Full OpenAPI 3 document: <http://localhost:8000/api/schema/> · Swagger UI: `/api/docs/` · ReDoc: `/api/redoc/`

<details>
<summary>Endpoint overview</summary>

**Auth** `/api/auth/`
`POST register/` · `POST token/` · `POST token/refresh/` · `POST token/verify/` · `GET|PATCH me/`

**Projects** `/api/projects/`
`GET|POST list-create` · `GET|PATCH|DELETE detail` · filters: `search`, `tag`, `is_public`, `ordering`

**Endpoints** `/api/endpoints/`
`GET|POST list-create` · `GET|PATCH|DELETE detail` · filters: `project`, `method`, `is_active`, `search`

**API keys** `/api/keys/`
`GET|POST list-create` · `GET|PATCH|DELETE detail` · `POST {id}/revoke/` · `POST {id}/rotate/` · `GET stats/`

**Analytics** `/api/analytics/`
`GET summary/` · `GET timeseries/` · `GET status-distribution/` · `GET top-endpoints/`
(all accept `?project=&days=1|7|30`)

**Logs** `/api/logs/`
`GET` — cursor paginated, filters: `search`, `project`, `method`, `status_class`,
`min_status`, `max_status`, `since`, `until`

**WebSocket** `ws://…/ws/logs/?token=<access_jwt>`
Server → client: `{"type": "log.created", "data": { …log… }}`

**Health** `GET /api/health/`

</details>

## Testing

```bash
cd backend
pytest                                  # 99 tests, in-memory SQLite
TEST_DB_ENGINE=postgres pytest          # same suite against PostgreSQL
ruff check . && ruff format --check .
```

Coverage highlights:

- `test_auth.py` — registration, weak/duplicate input, token pair, **refresh rotation**, verify, profile updates, and that the email cannot be changed through `PATCH`.
- `test_apis.py` — slug generation, **tenant isolation** (a second user gets 404, never 403-with-data), tag/search filtering, endpoint validation.
- `test_keys.py` — plaintext shown once, **secret never persisted** (only the SHA-256 digest), rotate revokes the previous key, scope validation, per-user isolation.
- `test_gateway.py` — every auth failure mode, mock responses, routing 404s, SSRF guard, rate limiting with `Retry-After`, and that counters/log rows are written.
- `test_analytics.py` — aggregation maths, window filtering, **tenant isolation of analytics**, cursor pagination stability, search/status-class filters.
- `test_realtime.py` — websocket handshake rejection, group fan-out, JWT resolution from the query string, and a regression test asserting every broadcast payload is JSON-serialisable (a raw `UUID` in the payload silently killed the live stream).
- `test_meta.py` — health probe, SPA hosting (client-side deep links return the shell while `/api/*` still 404s as JSON), and that the generated OpenAPI schema is valid and contains the expected paths.

## Project layout

```
apiforge/
├── Dockerfile                single image: Node-built SPA + Django ASGI
├── liara.json                Iranian PaaS (Liara) deployment config
├── docker/
│   └── entrypoint.sh         wait-for-db, migrate, collectstatic, seed
├── docker-compose.yml        PostgreSQL + Redis + the app
├── backend/
│   ├── config/                 settings (base/dev/production/test), urls, asgi, wsgi
│   ├── apps/
│   │   ├── common/             abstract models, pagination, errors, WS middleware, seeder
│   │   ├── accounts/           custom user, registration, JWT
│   │   ├── apis/               projects & endpoints
│   │   ├── keys/               API keys
│   │   ├── analytics/          request logs, aggregations, websocket consumer
│   │   └── gateway/            the public data plane
│   ├── tests/                  pytest suite + factories
│   └── pyproject.toml          ruff + pytest config
├── frontend/                   React SPA (Vite)
├── docs/
│   ├── api-contract.md         the contract the two halves agree on
│   └── deployment-fa.md        راهنمای دیپلوی روی Liara + دامنهٔ .ir
└── .github/workflows/         ci.yml · deploy-liara.yml
```

## Design decisions

**API keys are hashed, not stored.** Only a SHA-256 digest of the secret is
persisted; lookup uses the 12-character `prefix` and verification is a
constant-time `hmac.compare_digest`. A database dump cannot be replayed, and
the UI can still display `af_live_ab12••••••••••••`.

**The gateway never trusts the caller.** Every queryset is scoped to
`request.user`; an unknown or foreign project answers `404` rather than
`403`, so the public plane does not leak the existence of other tenants'
projects. Analytics aggregations take an explicit `owner` argument for the
same reason.

**Rate limiting lives in the cache, not the database.** A fixed-window counter
keyed on the API key keeps the hot path to a single Redis round trip. The
window is derived from `int(time / 60)`, so there is no sweeper job and no
write amplification on the request path.

**Logs use cursor pagination.** New rows arrive continuously; page-number
pagination would skip or duplicate entries while the user is scrolling.
`created_at` is a stable, indexed sort key, so cursors stay stable.

**The SPA receives a JWT once, then refreshes it silently.** An axios
interceptor refreshes on `401`, collapsing concurrent refreshes into a single
request, and falls back to a login redirect when the refresh token is dead.

**Everything is environment driven.** `dev` runs on SQLite with an in-memory
channel layer and zero dependencies; `production` requires a secret key, sets
HSTS/secure-cookie flags, and serves the React bundle itself so the whole
product is a single ASGI process on a single port. The only difference is
which settings module is loaded.

**One image, one port, no reverse proxy needed.** Vite's dev proxy is a
development convenience only. In the container the React shell is served by
WhiteNoise and Django routes every non-API path to `index.html` with a negative
lookahead (`^(?!api/|gateway/|ws/|admin/|static/|media/|__)`) — so deep links
like `/projects/<uuid>` work on a hard refresh, while a typo under `/api/`
still returns a JSON 404 instead of an HTML page.
