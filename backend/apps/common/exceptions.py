"""Uniform error envelopes.

DRF already returns helpful payloads; we only normalise the *shape* so the
frontend can render a message without knowing which exception raised:

    {"error": {"code": "...", "message": "...", "details": {...}}}
"""

from __future__ import annotations

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.views import exception_handler as drf_exception_handler


def _code_for(status_code: int, default: str = "error") -> str:
    mapping = {
        status.HTTP_400_BAD_REQUEST: "validation_error",
        status.HTTP_401_UNAUTHORIZED: "not_authenticated",
        status.HTTP_403_FORBIDDEN: "permission_denied",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
        status.HTTP_429_TOO_MANY_REQUESTS: "throttled",
    }
    return mapping.get(status_code, default)


def api_exception_handler(exc, context):
    """Wrap every error into ``{"error": {...}}`` while keeping field errors."""
    if isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(
            detail=str(exc) or "You do not have permission to perform this action."
        )
    if isinstance(exc, Http404):
        exc = exceptions.NotFound(detail="Not found.")

    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail and len(detail) == 1:
        message = str(detail["detail"])
        payload = {"code": _code_for(response.status_code), "message": message}
    elif isinstance(detail, list) and detail:
        message = str(detail[0])
        payload = {"code": _code_for(response.status_code), "message": message, "details": detail}
    else:
        # Field errors: keep them as-is under `details` and provide a
        # human-readable summary for toast-style rendering.
        message = "Validation failed."
        payload = {
            "code": _code_for(response.status_code),
            "message": message,
            "details": detail,
        }

    response.data = {"error": payload}
    return response
