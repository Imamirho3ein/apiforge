"""API key management: issue, rotate, revoke, delete."""

from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.analytics.schemas import APIKeyStatsSerializer
from apps.common.pagination import DefaultPagination

from .models import APIKey
from .serializers import APIKeyCreateSerializer, APIKeySerializer


class APIKeyViewSet(ModelViewSet):
    """Keys are scoped to the authenticated user — always."""

    permission_classes = [IsAuthenticated]
    pagination_class = DefaultPagination
    search_fields = ["name", "prefix"]
    ordering_fields = ["name", "created_at", "last_used_at", "total_requests"]
    ordering = ["-created_at"]
    lookup_value_regex = "[0-9a-f-]{36}"
    queryset = APIKey.objects.none()  # replaced per-request in get_queryset

    def get_serializer_class(self):
        # create/rotate return the plaintext secret exactly once.
        if self.action in {"create", "rotate"}:
            return APIKeyCreateSerializer
        return APIKeySerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return APIKey.objects.none()
        return (
            APIKey.objects.filter(user=self.request.user)
            .select_related("project")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        """Issue the secret: the plaintext never comes from the client."""
        instance, plaintext = APIKey.generate(user=self.request.user, **serializer.validated_data)
        instance.save()
        serializer.instance = instance
        instance._plaintext = plaintext

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        key = self.get_object()
        key.is_active = False
        key.save(update_fields=["is_active", "updated_at"])
        return Response(APIKeySerializer(key).data)

    @action(detail=True, methods=["post"])
    def rotate(self, request, pk=None):
        """Issue a replacement key; the old one is revoked immediately."""
        old = self.get_object()
        instance, plaintext = APIKey.generate(
            user=old.user,
            name=old.name,
            project=old.project,
            scopes=old.scopes,
            rate_limit=old.rate_limit,
            expires_at=old.expires_at,
        )
        instance.save()
        old.is_active = False
        old.save(update_fields=["is_active", "updated_at"])
        instance._plaintext = plaintext
        return Response(APIKeyCreateSerializer(instance).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary="Key statistics",
        responses=APIKeyStatsSerializer,
        tags=["keys"],
    )
    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Quick counts for the dashboard header."""
        from django.db.models import Sum

        qs = self.get_queryset()
        now = timezone.now()
        return Response(
            {
                "total": qs.count(),
                "active": qs.filter(is_active=True).exclude(expires_at__lte=now).count(),
                "expired": qs.filter(is_active=True, expires_at__lte=now).count(),
                "revoked": qs.filter(is_active=False).count(),
                "total_requests": qs.aggregate(total=Sum("total_requests"))["total"] or 0,
            }
        )
