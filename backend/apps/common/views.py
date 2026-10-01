"""Service-level views: health probe and the SPA entry point."""

from __future__ import annotations

from django.conf import settings
from django.db import connection
from django.http import FileResponse, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET


@csrf_exempt
@require_GET
def health(request) -> JsonResponse:
    """Liveness/readiness probe — never requires authentication."""
    database = "ok"
    http_status = 200
    try:
        connection.ensure_connection()
    except Exception:  # pragma: no cover - only on a broken DB
        database = "error"
        http_status = 503

    return JsonResponse(
        {
            "status": "ok" if http_status == 200 else "degraded",
            "database": database,
            "version": settings.VERSION,
        },
        status=http_status,
    )


@require_GET
def spa(request) -> HttpResponse:
    """Serve ``index.html`` and let React Router own client-side routing.

    Only reached for paths that are not API, gateway, websocket, admin or
    static URLs — see the catch-all pattern in ``config/urls.py``.
    """
    index = settings.SPA_INDEX_FILE
    if not index.is_file():  # pragma: no cover - misconfigured image
        return HttpResponse("The frontend bundle is missing from this image.", status=503)
    response = FileResponse(index.open("rb"), content_type="text/html")
    # The shell must never be cached, or clients keep an old asset manifest.
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
