"""Request log — the single source of truth for analytics."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class RequestLog(TimeStampedModel):
    """One row per gateway request.

    ``owner`` is denormalised (copied from the project) so the log explorer
    can filter by user without a join, and so WebSocket groups can be
    addressed even after a project is deleted.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="request_logs",
    )
    project = models.ForeignKey(
        "apis.ApiProject",
        null=True,
        on_delete=models.SET_NULL,
        related_name="request_logs",
    )
    endpoint = models.ForeignKey(
        "apis.Endpoint",
        null=True,
        on_delete=models.SET_NULL,
        related_name="request_logs",
    )
    api_key = models.ForeignKey(
        "keys.APIKey",
        null=True,
        on_delete=models.SET_NULL,
        related_name="request_logs",
    )
    # Denormalised display names — survive key/endpoint deletion.
    key_name = models.CharField(max_length=120, blank=True, default="")
    endpoint_name = models.CharField(max_length=120, blank=True, default="")

    method = models.CharField(max_length=7)
    path = models.CharField(max_length=500)
    status_code = models.PositiveSmallIntegerField()
    latency_ms = models.FloatField(default=0)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["owner", "-created_at"]),
            models.Index(fields=["project", "-created_at"]),
            models.Index(fields=["status_code"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.method} {self.path} -> {self.status_code}"
