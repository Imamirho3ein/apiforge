"""Analytics endpoints + the log explorer."""

from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.common.pagination import LogCursorPagination

from . import services
from .filters import RequestLogFilter
from .models import RequestLog
from .schemas import (
    StatusDistributionSerializer,
    SummarySerializer,
    TimeseriesSerializer,
    TopEndpointsSerializer,
)
from .serializers import RequestLogSerializer


def _days(request) -> int:
    try:
        days = int(request.query_params.get("days", 7))
    except (TypeError, ValueError):
        days = 7
    return max(1, min(days, 90))


def _project(request) -> str | None:
    value = request.query_params.get("project")
    return value or None


class SummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Aggregated usage summary",
        parameters=[
            OpenApiParameter(
                "project",
                OpenApiTypes.UUID,
                description="Limit the aggregate to a single project.",
            ),
            OpenApiParameter(
                "days", OpenApiTypes.INT, description="Window size (1-90, default 7)."
            ),
        ],
        responses=SummarySerializer,
        tags=["analytics"],
    )
    def get(self, request) -> Response:
        data = services.summary(
            owner=request.user, project_id=_project(request), days=_days(request)
        )
        return Response(data)


class TimeseriesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Request volume over time",
        parameters=[
            OpenApiParameter("project", OpenApiTypes.UUID),
            OpenApiParameter("days", OpenApiTypes.INT),
            OpenApiParameter("interval", OpenApiTypes.STR, enum=["hour", "day"]),
        ],
        responses=TimeseriesSerializer,
        tags=["analytics"],
    )
    def get(self, request) -> Response:
        interval = request.query_params.get("interval", "hour")
        if interval not in services.INTERVALS:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "interval must be 'hour' or 'day'.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        points = services.timeseries(
            owner=request.user,
            project_id=_project(request),
            days=_days(request),
            interval=interval,
        )
        return Response({"interval": interval, "points": points})


class StatusDistributionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Status code distribution (by class and by code)",
        parameters=[
            OpenApiParameter("project", OpenApiTypes.UUID),
            OpenApiParameter("days", OpenApiTypes.INT),
        ],
        responses=StatusDistributionSerializer,
        tags=["analytics"],
    )
    def get(self, request) -> Response:
        return Response(
            services.status_distribution(
                owner=request.user, project_id=_project(request), days=_days(request)
            )
        )


class TopEndpointsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Busiest endpoints of the window",
        parameters=[
            OpenApiParameter("project", OpenApiTypes.UUID),
            OpenApiParameter("days", OpenApiTypes.INT),
        ],
        responses=TopEndpointsSerializer,
        tags=["analytics"],
    )
    def get(self, request) -> Response:
        return Response(
            {
                "results": services.top_endpoints(
                    owner=request.user,
                    project_id=_project(request),
                    days=_days(request),
                )
            }
        )


class RequestLogViewSet(ReadOnlyModelViewSet):
    """Cursor-paginated, searchable, filterable request log.

    Cursor pagination (instead of page numbers) keeps the stream stable while
    new rows arrive — the UI can "load more" without duplicates.
    """

    serializer_class = RequestLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = LogCursorPagination
    filterset_class = RequestLogFilter
    search_fields = ["path", "method", "key_name", "user_agent", "ip_address"]
    queryset = RequestLog.objects.none()  # replaced per-request in get_queryset

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return RequestLog.objects.none()
        return (
            RequestLog.objects.filter(owner=self.request.user)
            .select_related("project", "endpoint", "api_key")
            .order_by("-created_at")
        )
