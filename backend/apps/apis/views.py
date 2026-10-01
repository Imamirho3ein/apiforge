"""CRUD view sets for API projects and endpoints.

Both view sets are hard-scoped to ``request.user`` — cross-tenant access is
impossible even if a client guesses a UUID.
"""

from __future__ import annotations

from django.db.models import Count
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.common.pagination import DefaultPagination

from .filters import ApiProjectFilter, EndpointFilter
from .models import ApiProject, Endpoint
from .serializers import ApiProjectSerializer, EndpointSerializer


class ApiProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ApiProjectSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = DefaultPagination
    filterset_class = ApiProjectFilter
    search_fields = ["name", "description", "slug"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["-created_at"]
    lookup_value_regex = "[0-9a-f-]{36}"
    queryset = ApiProject.objects.none()  # replaced per-request in get_queryset

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return ApiProject.objects.none()
        return (
            ApiProject.objects.filter(owner=self.request.user)
            .annotate(endpoints_count=Count("endpoints", distinct=True))
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class EndpointViewSet(viewsets.ModelViewSet):
    serializer_class = EndpointSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = DefaultPagination
    filterset_class = EndpointFilter
    search_fields = ["name", "path", "description"]
    ordering_fields = ["path", "method", "request_count", "created_at"]
    ordering = ["path"]
    lookup_value_regex = "[0-9a-f-]{36}"
    queryset = Endpoint.objects.none()  # replaced per-request in get_queryset

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return Endpoint.objects.none()
        return (
            Endpoint.objects.filter(project__owner=self.request.user)
            .select_related("project")
            .order_by("path")
        )
