"""API projects and their endpoints."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.utils import unique_slug


class ApiProject(TimeStampedModel):
    """A logical group of endpoints managed by one owner."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_projects",
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    base_path = models.CharField(max_length=60, default="/v1")
    is_public = models.BooleanField(default=False)
    tags = models.JSONField(default=list, blank=True)
    # Denormalised ",a,b,c," projection of `tags` so tag filtering is a
    # portable SQL LIKE instead of a backend-specific JSON containment.
    tags_text = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["owner", "-created_at"]),
            models.Index(fields=["slug"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["owner", "slug"], name="unique_slug_per_owner")
        ]

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = unique_slug(self, self.name)
        self.tags_text = ",".join(f",{t}" for t in self.tags) if self.tags else ""
        super().save(*args, **kwargs)

    @property
    def gateway_base_url(self) -> str:
        return f"{settings.GATEWAY_BASE_URL}/gateway/{self.slug}"

    def __str__(self) -> str:
        return self.name


class Endpoint(TimeStampedModel):
    """A single routed path — answered by a mock or proxied upstream."""

    class Method(models.TextChoices):
        GET = "GET", "GET"
        POST = "POST", "POST"
        PUT = "PUT", "PUT"
        PATCH = "PATCH", "PATCH"
        DELETE = "DELETE", "DELETE"

    project = models.ForeignKey(ApiProject, on_delete=models.CASCADE, related_name="endpoints")
    name = models.CharField(max_length=120)
    method = models.CharField(max_length=7, choices=Method.choices, default=Method.GET)
    path = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    # Mock mode ----------------------------------------------------------
    mock_enabled = models.BooleanField(default=False)
    mock_status = models.PositiveSmallIntegerField(default=200)
    mock_body = models.JSONField(default=dict, blank=True)

    # Proxy mode ---------------------------------------------------------
    target_url = models.URLField(max_length=500, blank=True)

    # Denormalised counter (stats are computed from RequestLog) ----------
    request_count = models.BigIntegerField(default=0)

    class Meta:
        ordering = ("path",)
        indexes = [
            models.Index(fields=["project", "method", "path"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "method", "path"],
                name="unique_method_path_per_project",
            )
        ]

    def clean(self) -> None:
        from django.core.exceptions import ValidationError

        path = self.path or ""
        if not path.startswith("/"):
            raise ValidationError({"path": "Path must start with '/'."})
        if "//" in path:
            raise ValidationError({"path": "Path must not contain '//'."})
        if not self.mock_enabled and not self.target_url:
            raise ValidationError(
                {"target_url": ("Enable mock mode or provide an upstream target URL.")}
            )
        if self.mock_status < 100 or self.mock_status > 599:
            raise ValidationError({"mock_status": "Must be a valid HTTP status."})

    @property
    def gateway_url(self) -> str:
        return f"{self.project.gateway_base_url}{self.path}"

    def __str__(self) -> str:
        return f"{self.method} {self.path}"
