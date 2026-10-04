# APIForge — resume bullet & interview prep

> Short, honest, ready-to-paste material. Every claim here matches something
> that is actually implemented and verified in CI.

---

## 1. Resume entry (English)

### One-liner (for a skills-heavy layout)

> **APIForge — API management platform** | Django 6, DRF, Channels, React 19, TypeScript,
> PostgreSQL, Redis, Docker
> Built an API gateway with key-based authentication, rate limiting, response mocking and
> upstream proxying, plus live request-log analytics streamed over WebSockets.
> 99 passing tests (SQLite + PostgreSQL) and a CI pipeline covering lint, tests, the OpenAPI
> schema, the frontend build and a Docker image build + smoke test.

### Full entry (for a 1–2 page résumé)

> **APIForge — API Management Platform** (personal project) · Django 6, DRF, Channels,
> React 19, TypeScript, PostgreSQL, Docker
>
> - Built an **API gateway** with API-key authentication, per-key fixed-window rate limiting
>   backed by Redis, response mocking, and upstream proxying with `httpx`.
> - Designed the **API key lifecycle**: only SHA-256 digests are persisted (the plaintext is
>   revealed exactly once), with constant-time verification and rotate/revoke.
> - Shipped a **live traffic dashboard** — SQL aggregations (summary, time series, status
>   distribution, top endpoints) and a real-time request-log stream over WebSockets
>   (Django Channels), with **cursor pagination** so the table stays stable while rows
>   stream in.
> - Enforced **multi-tenant isolation** across every layer, returning `404` rather than `403`
>   for other tenants' resources to avoid existence leaks, and added an SSRF guard on proxied
>   upstreams.
> - Wrote **99 automated tests** (green on SQLite and PostgreSQL) and a CI pipeline with
>   Ruff, Django system checks, OpenAPI schema generation, migration checks, a frontend
>   build, and a **Docker image build with a smoke test**; the final multi-stage image serves
>   the SPA, API, gateway and websockets from a **single port**.

---

## 2. Spoken intro

### 30 seconds

> "I built an API management platform, roughly a mini Kong with a Stripe-style dashboard.
> You declare an API, issue a scoped API key, and your clients call one public URL. The
> gateway authenticates the key, enforces a rate limit, then either returns a mocked
> response or proxies to the real upstream service — and every request is logged and
> streamed live into the dashboard."

### 2 minutes

1. **Two planes.** `/api/*` is the management plane (JWT); `/gateway/*` is the data plane
   (API key). Clients never touch an admin token.
2. **Keys are hashed.** Only a SHA-256 digest is stored; the plaintext is shown once.
   Lookup uses a 12-character prefix, verification uses `hmac.compare_digest`.
3. **Rate limiting lives in the cache**, not the database: a fixed-window counter keyed on
   the key id, so the hot path costs one Redis round trip and needs no sweeper job.
4. **Live logs.** Every new row is pushed to that user's Channels group; the SPA merges it
   at the top of the table without a refetch.
5. **Tenant isolation.** No unfiltered queryset exists; foreign resources answer `404`, not
   `403`, so existence is not leaked.
6. **One image, one port.** In the container Django serves the React shell via WhiteNoise,
   so a single ASGI process answers `/api`, `/ws`, `/gateway` and the SPA.

---

## 3. Likely interview questions

<details>
<summary><b>Why hash the API keys?</b></summary>

Because a database leak should not become a credential leak. Only the digest is persisted.
To keep lookups fast I store a 12-character prefix and query on it, then compare with
`hmac.compare_digest` so verification is constant-time and not vulnerable to timing attacks.
</details>

<details>
<summary><b>Where did you implement rate limiting, and why not the database?</b></summary>

In the cache. The gateway is the hot path for every customer request, so writing a row per
request is write amplification. The fixed-window counter is keyed
`key_id + int(time / 60)`, which means no cleanup job and no unbounded growth. In production
`CACHES` points at Redis so counters are shared across workers; LocMem is the local fallback.
</details>

<details>
<summary><b>Why cursor pagination for the logs?</b></summary>

The log table grows continuously. With page-number pagination, rows shift while you scroll,
so pages duplicate or skip entries. A cursor over a stable, indexed column (`created_at`)
keeps every page stable and is O(1).
</details>

<details>
<summary><b>How do you authenticate the WebSocket?</b></summary>

Browsers cannot set headers on a WebSocket handshake, so the JWT travels in the query string
(`?token=…`). A middleware validates it and populates `scope["user"]`; an invalid token
closes the connection with code `4401`.
</details>

<details>
<summary><b>Why UUIDs instead of auto-increment integers?</b></summary>

Two reasons: consistency (every model is UUID, so foreign keys are too) and that a user's
identifier inside the JWT is not a guessable sequential integer. Worth noting: the user
model originally inherited `AutoField` from `AbstractUser`, which broke that consistency —
the mismatch was caught when the SPA crashed on `user.id.slice`.
</details>

<details>
<summary><b>How do you prevent cross-tenant access?</b></summary>

Two layers. First, every viewset queryset is scoped to `request.user`, so guessing a UUID
returns `404`, not data. Second, the analytics aggregations take an explicit `owner`
argument. There is a regression test that requests another user's analytics and expects zero
— that test is what caught a real data leak while I was building it.
</details>

<details>
<summary><b>What about SSRF when proxying upstreams?</b></summary>

Loopback and private-range targets are rejected unless explicitly allowed in development
(`ALLOW_PRIVATE_UPSTREAM`, which defaults to on only when `DEBUG` is on). Scheme is also
validated, and hop-by-hop headers are stripped before forwarding.
</details>

<details>
<summary><b>Why a single Docker image for both frontend and backend?</b></summary>

Two services plus a reverse proxy is the usual PaaS shape. With one multi-stage image,
Django serves the React shell through WhiteNoise and routes every non-API path to
`index.html` (a negative lookahead keeps `/api/*` untouched), so a single ASGI process
answers everything on one port — simpler to deploy and to reason about.
</details>

<details>
<summary><b>How would you scale it?</b></summary>

Three moves: move request logs out of the main database (they grow fastest) into a
columnar store or a time-series extension; pre-aggregate analytics into rollups or
materialized views instead of computing on every request; and replace the fixed window with
a sliding-window or token-bucket limiter, since a fixed window lets traffic double at the
boundary.
</details>

<details>
<summary><b>What did you not build?</b></summary>

- Two-factor auth and password reset.
- Browser-level end-to-end tests (Playwright); coverage is at the API and websocket-consumer
  level.
- Prometheus/OpenTelemetry metrics and alerting.
- A production deployment (the free Iranian tier was insufficient) — though the Docker
  image build and smoke test are verified in CI.
</details>

---

## 4. Claims to avoid

| ❌ Don't say | ✅ Say |
|---|---|
| "It's live in production" | "The Docker image builds and passes a smoke test in CI; a PaaS deploy is one command" |
| "Handles millions of requests" | "Verified against a 1,260-row demo dataset" |
| "100% test coverage" | "99 tests, green on two database backends" |
| "Used in production" | "Designed for scale; not yet run at scale" |

Being explicit about the boundaries reads as senior, not as a gap.

---

## 5. Numbers you can quote

| Metric | Where it comes from |
|---|---|
| 99 tests on SQLite **and** PostgreSQL | `pytest` + CI matrix |
| 4 CI stages: lint, tests, frontend, Docker | `.github/workflows/ci.yml` |
| 20 paths in the generated OpenAPI schema | `manage.py spectacular` |
| 6 Django apps with separated domains | `backend/apps/` |
| ~3,600 lines Python + ~4,570 lines TypeScript | `cloc` |
| UUID primary keys on every model | `common.models.TimeStampedModel` |
| Bugs found and fixed with a regression test | 4 (tenant leak, dead JWT rotation, websocket payload, UUID PK) |

That last row is worth memorising: each was found by testing behaviour end to end, not by
reading code, and each has a test that fails without the fix.

---

## 6. Interview checklist

- [ ] Proofread the bullet text
- [ ] Re-read §3 in the "why did you choose this?" direction
- [ ] Know what you did **not** build (last item of §3)
- [ ] Have the repository link and the green CI badge handy
- [ ] Only add a live URL to the résumé once it actually exists
