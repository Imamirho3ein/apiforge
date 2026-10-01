# APIForge — API Contract

Base URL (dev): `http://localhost:8000`
Auth header: `Authorization: Bearer <access_token>` (JWT)
Gateway header: `X-API-Key: <api_key>`

All `/api/**` endpoints are JSON. Pagination (page-number based) returns:

```json
{ "count": 0, "next": null, "previous": null, "results": [] }
```

`/api/logs/` uses **cursor** pagination and returns `{ "next": ..., "previous": ..., "results": [...] }`
(no `count`).

Errors follow DRF conventions: `{ "detail": "..." }` or `{ "<field>": ["..."] }`.
Gateway errors use: `{ "error": { "code": "...", "message": "..." } }`.

---

## Auth — `/api/auth/`

| Method | Path                  | Body                                        | Response |
|--------|-----------------------|---------------------------------------------|----------|
| POST   | `/api/auth/register/` | `{email, username, password, first_name?, last_name?}` | `201 {access, refresh, user}` |
| POST   | `/api/auth/token/`    | `{email, password}`                         | `200 {access, refresh, user}` |
| POST   | `/api/auth/token/refresh/` | `{refresh}`                            | `200 {access, refresh?}` (refresh rotated) |
| POST   | `/api/auth/token/verify/`  | `{token}`                             | `204` |
| GET    | `/api/auth/me/`       | —                                           | `200 user` |
| PATCH  | `/api/auth/me/`       | partial user                                | `200 user` |

**user object**

```json
{
  "id": "uuid", "email": "a@b.c", "username": "jane",
  "first_name": "", "last_name": "", "avatar_url": "", "company": "", "bio": ""
}
```

## Projects — `/api/projects/`

CRUD (list/create/retrieve/update/destroy). Query: `?search=&ordering=`.

```json
{
  "id": "uuid", "name": "Payments API", "slug": "payments-api",
  "description": "", "base_path": "/v1", "is_public": false,
  "tags": ["payments"], "endpoints_count": 3,
  "created_at": "ISO", "updated_at": "ISO"
}
```

Create body: `{name, description?, base_path?, is_public?, tags?}` — slug is auto-generated.

## Endpoints — `/api/endpoints/`

CRUD. Query: `?project=<uuid>&method=GET&search=`.

```json
{
  "id": "uuid", "project": "uuid", "name": "List users", "method": "GET",
  "path": "/users", "description": "", "is_active": true,
  "mock_enabled": true, "mock_status": 200, "mock_body": {},
  "target_url": "", "request_count": 0,
  "gateway_url": "http://localhost:8000/gateway/<project-slug>/users",
  "created_at": "ISO", "updated_at": "ISO"
}
```

Create body: `{project, name, method, path, ...}`. `path` must start with `/`.
Methods: `GET, POST, PUT, PATCH, DELETE`.

## API Keys — `/api/keys/`

| Method | Path                     | Notes |
|--------|--------------------------|-------|
| GET    | `/api/keys/`             | `?search=&project=<uuid>` |
| POST   | `/api/keys/`             | `{name, project?, scopes?, rate_limit?, expires_at?}` → `201` **includes `api_key` (plaintext, shown once)** |
| GET    | `/api/keys/{id}/`        | |
| PATCH  | `/api/keys/{id}/`        | update `name, scopes, rate_limit, expires_at` |
| DELETE | `/api/keys/{id}/`        | `204` |
| POST   | `/api/keys/{id}/revoke/` | `200 {…, is_active: false}` |
| POST   | `/api/keys/{id}/rotate/` | `200 {…, api_key: "<new plaintext>"}` |

**key object** (never contains the full secret):

```json
{
  "id": "uuid", "name": "Staging", "prefix": "af_live_ab12",
  "masked_key": "af_live_ab12••••••••••••",
  "project": "uuid|null", "project_name": "Payments API|null",
  "scopes": ["read", "write"], "rate_limit": 60, "is_active": true,
  "expires_at": "ISO|null", "last_used_at": "ISO|null",
  "total_requests": 0, "created_at": "ISO",
  "api_key": "af_live_..."   // ONLY on create/rotate
}
```

Scopes: `read | write | admin`. `rate_limit` = requests per minute (default 60).

## Analytics — `/api/analytics/`

All GET, common query: `?project=<uuid>&days=1|7|30` (default 7).

**`/summary/`**

```json
{
  "total_requests": 1234, "success_rate": 98.2, "error_count": 24,
  "avg_latency_ms": 45.6, "unique_keys": 3, "projects": 2,
  "period": {"days": 7, "since": "ISO"}
}
```

**`/timeseries/?interval=hour|day`**

```json
{"interval": "hour", "points": [{"bucket": "2026-10-01T13:00:00", "total": 5, "errors": 1}]}
```

**`/status-distribution/`**

```json
{
  "by_class": [{"bucket": "2xx", "count": 100}],
  "by_code": [{"status": 200, "count": 100}]
}
```

**`/top-endpoints/`**

```json
{"results": [{"method": "GET", "path": "/users", "count": 42, "avg_latency_ms": 12.4}]}
```

## Logs — `/api/logs/`

GET only, cursor paginated. Query:
`?project=<uuid>&method=GET&status_class=2xx|4xx|5xx&min_status=&max_status=&search=&since=ISO&until=ISO`

```json
{
  "next": "…cursor url…", "previous": null,
  "results": [{
    "id": "uuid", "project": "uuid", "project_name": "Payments API",
    "endpoint": "uuid|null", "endpoint_name": "List users",
    "method": "GET", "path": "/users", "status_code": 200,
    "latency_ms": 12.3, "api_key": "uuid|null", "key_name": "Staging",
    "ip_address": "127.0.0.1", "user_agent": "…", "created_at": "ISO"
  }]
}
```

## WebSocket — `ws://localhost:8000/ws/logs/?token=<access_jwt>`

Server → client messages:

```json
{"type": "log.created", "data": { …log object… }}
```

Close code `4401` when token missing/invalid.

## Gateway — `ANY /gateway/<project-slug>/<path>`

Headers: `X-API-Key: af_live_...` (or `Authorization: ApiKey af_live_...`).

| Case | Status | Body |
|------|--------|------|
| no key | 401 | `{"error":{"code":"api_key_required","message":"…"}}` |
| bad key | 401 | `{"error":{"code":"invalid_api_key","message":"…"}}` |
| revoked/expired | 403 | `{"error":{"code":"key_revoked"|"key_expired",…}}` |
| key belongs to another project | 403 | `{"error":{"code":"key_scope_mismatch",…}}` |
| rate limited | 429 | `{"error":{"code":"rate_limited",…}}` + `Retry-After` header |
| no matching endpoint | 404 | `{"error":{"code":"endpoint_not_found",…}}` |
| endpoint inactive | 404 | same |
| no mock & no target | 501 | `{"error":{"code":"no_backend_configured",…}}` |
| upstream failure | 502 | `{"error":{"code":"upstream_error",…}}` |
| success | mock_status / upstream status | mock body or upstream body |

Response headers on success: `X-Request-Id`, `X-Gateway-Latency-Ms`, `X-RateLimit-Limit`,
`X-RateLimit-Remaining`.

## Misc

- `GET /api/health/` → `{"status":"ok","database":"ok","version":"1.0.0"}`
- `GET /api/schema/` → OpenAPI YAML/JSON, `GET /api/docs/` → Swagger UI
- DRF throttling on auth endpoints only: `auth` = 10/min per IP.
