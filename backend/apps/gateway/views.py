"""The public data plane: ``/gateway/<project-slug>/<path>``.

Requests are authenticated with an API key (never a JWT), rate limited per
key, routed to either a mock response or an upstream service, logged to
RequestLog and streamed to the dashboard over WebSocket.
"""

from __future__ import annotations

import logging
import time

import httpx
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.gzip import gzip_page

from apps.analytics.models import RequestLog
from apps.apis.models import ApiProject, Endpoint
from apps.common.utils import client_ip, is_private_upstream
from apps.keys.models import PREFIX_LENGTH, APIKey

from . import ratelimit

logger = logging.getLogger(__name__)

UPSTREAM_TIMEOUT = 10.0

# Headers that must not be forwarded upstream.
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "x-api-key",
    "authorization",
}


def _error(code: str, message: str, status: int, headers: dict | None = None) -> JsonResponse:
    response = JsonResponse({"error": {"code": code, "message": message}}, status=status)
    for header, value in (headers or {}).items():
        response[header] = str(value)
    return response


def _extract_key(request) -> str | None:
    key = request.headers.get("X-API-Key")
    if not key:
        authorization = request.headers.get("Authorization", "")
        if authorization.lower().startswith("apikey "):
            key = authorization[7:].strip()
    return key.strip() if key else None


def _forward(request, endpoint: Endpoint) -> tuple[int, bytes, str]:
    """Proxy the request upstream. Returns (status, body, content-type)."""
    url = endpoint.target_url
    if not url.startswith(("http://", "https://")):
        return 502, b'{"error":"unsupported upstream scheme"}', "application/json"
    if is_private_upstream(url):
        logger.warning("Blocked private upstream target: %s", url)
        return 502, b'{"error":"upstream target is not allowed"}', "application/json"

    headers = {
        name: value for name, value in request.headers.items() if name.lower() not in HOP_BY_HOP
    }
    headers["X-Forwarded-For"] = client_ip(request) or ""

    try:
        with httpx.Client(timeout=UPSTREAM_TIMEOUT) as client:
            response = client.request(
                request.method,
                url,
                params=request.GET.urlencode(),
                content=request.body,
                headers=headers,
            )
    except httpx.TimeoutException:
        return 504, b'{"error":"upstream timeout"}', "application/json"
    except httpx.HTTPError as exc:
        logger.warning("Upstream error for %s: %s", url, exc)
        return 502, b'{"error":"upstream unreachable"}', "application/json"

    return (
        response.status_code,
        response.content,
        response.headers.get("content-type", "application/json"),
    )


@csrf_exempt
@gzip_page
def proxy(request, slug: str, subpath: str):
    """Route ``/gateway/<slug>/<subpath>`` to the matching endpoint."""
    started = time.perf_counter()

    project = get_object_or_404(ApiProject, slug=slug)
    method = request.method.upper()
    path = "/" + subpath.lstrip("/")

    # ---- 1. Authenticate the API key ----------------------------------
    raw_key = _extract_key(request)
    if not raw_key:
        return _error(
            "api_key_required",
            "Provide an API key in the 'X-API-Key' header.",
            401,
            {"WWW-Authenticate": "ApiKey"},
        )

    api_key = (
        APIKey.objects.select_related("user", "project")
        .filter(prefix=raw_key[:PREFIX_LENGTH])
        .first()
    )
    if api_key is None or not api_key.verify(raw_key):
        return _error("invalid_api_key", "The provided API key is not valid.", 401)

    if not api_key.is_active:
        return _error("key_revoked", "This API key has been revoked.", 403)
    if api_key.is_expired:
        return _error("key_expired", "This API key has expired.", 403)
    # Do not leak the existence of another tenant's project.
    if api_key.user_id != project.owner_id:
        return _error("project_not_found", f"No project '{slug}'.", 404)
    if api_key.project_id and api_key.project_id != project.id:
        return _error(
            "key_scope_mismatch",
            "This API key is not valid for the requested project.",
            403,
        )

    # ---- 2. Rate limit -------------------------------------------------
    allowed, used, retry_after = ratelimit.consume(str(api_key.id), api_key.rate_limit)
    rate_headers = {
        "X-RateLimit-Limit": api_key.rate_limit,
        "X-RateLimit-Remaining": max(0, api_key.rate_limit - used),
    }
    if not allowed:
        return _error(
            "rate_limited",
            f"Rate limit of {api_key.rate_limit} requests/minute exceeded.",
            429,
            {**rate_headers, "Retry-After": retry_after},
        )

    # ---- 3. Route ------------------------------------------------------
    endpoint = (
        Endpoint.objects.filter(project=project, method=method, path=path, is_active=True)
        .select_related("project")
        .first()
    )

    if endpoint is None:
        return _error(
            "endpoint_not_found",
            f"No active {method} endpoint registered for {path}.",
            404,
            rate_headers,
        )

    if endpoint.mock_enabled:
        status_code = endpoint.mock_status
        body = endpoint.mock_body or {}
        if isinstance(body, (dict, list)):
            payload = JsonResponse(body, status=status_code, safe=isinstance(body, dict))
            for header, value in rate_headers.items():
                payload[header] = str(value)
            response = payload
        else:
            response = HttpResponse(str(body), status=status_code, content_type="text/plain")
    else:
        if not endpoint.target_url:
            response = _error(
                "no_backend_configured",
                "This endpoint has neither a mock response nor an upstream URL.",
                501,
                rate_headers,
            )
        else:
            status_code, raw_body, content_type = _forward(request, endpoint)
            response = HttpResponse(raw_body, status=status_code, content_type=content_type)
            for header, value in rate_headers.items():
                response[header] = str(value)

    # ---- 4. Record + broadcast ----------------------------------------
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    response["X-Request-Id"] = ""  # replaced below once the row exists
    response["X-Gateway-Latency-Ms"] = latency_ms

    log = RequestLog.objects.create(
        owner=project.owner,
        project=project,
        endpoint=endpoint,
        api_key=api_key,
        key_name=api_key.name,
        endpoint_name=endpoint.name,
        method=method,
        path=path,
        status_code=response.status_code,
        latency_ms=latency_ms,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent", "")[:300],
    )
    response["X-Request-Id"] = str(log.id)

    with transaction.atomic():
        APIKey.objects.filter(pk=api_key.id).update(
            total_requests=F("total_requests") + 1,
            last_used_at=log.created_at,
        )
        Endpoint.objects.filter(pk=endpoint.pk).update(request_count=F("request_count") + 1)

    return response
