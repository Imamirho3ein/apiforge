from django.http import JsonResponse
from rest_framework import status


def page_not_found(request, exception=None) -> JsonResponse:
    """JSON 404s — the API never returns an HTML error page."""
    return JsonResponse(
        {"error": {"code": "not_found", "message": "The requested resource was not found."}},
        status=status.HTTP_404_NOT_FOUND,
    )
