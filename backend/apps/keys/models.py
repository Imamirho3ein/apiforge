"""API key model — secrets are stored as salted SHA-256 hashes only."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel

KEY_PREFIX = "af_live"
KEY_ENTROPY_BYTES = 32
PREFIX_LENGTH = 12  # characters of the plaintext kept for display


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class APIKey(TimeStampedModel):
    """A credential used against the public gateway.

    The plaintext is shown exactly once (on create/rotate). Only the SHA-256
    digest is persisted, so a database leak does not expose live secrets.
    """

    class Scopes(models.TextChoices):
        READ = "read", "Read"
        WRITE = "write", "Write"
        ADMIN = "admin", "Admin"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    # Null project => the key works for every project of the user.
    project = models.ForeignKey(
        "apis.ApiProject",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    name = models.CharField(max_length=120)
    prefix = models.CharField(max_length=PREFIX_LENGTH, db_index=True)
    key_hash = models.CharField(max_length=64, db_index=True)
    scopes = models.JSONField(default=list, blank=True)
    rate_limit = models.PositiveIntegerField(default=60, help_text="Requests per minute")
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    total_requests = models.BigIntegerField(default=0)

    # Transient — set by generate()/rotate(), never persisted.
    _plaintext: str | None = None

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["prefix"]),
        ]

    # -- secret handling ---------------------------------------------------
    @classmethod
    def generate(cls, **fields) -> tuple[APIKey, str]:
        """Create an unsaved key and return ``(instance, plaintext)``."""
        plaintext = f"{KEY_PREFIX}_{secrets.token_urlsafe(KEY_ENTROPY_BYTES)}"
        instance = cls(
            prefix=plaintext[:PREFIX_LENGTH],
            key_hash=_hash_token(plaintext),
            **fields,
        )
        instance._plaintext = plaintext
        return instance, plaintext

    def verify(self, plaintext: str) -> bool:
        return hmac.compare_digest(self.key_hash, _hash_token(plaintext))

    @property
    def masked_key(self) -> str:
        return f"{self.prefix}{'•' * 16}"

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= timezone.now()

    @property
    def status(self) -> str:
        if not self.is_active:
            return "revoked"
        if self.is_expired:
            return "expired"
        return "active"

    def __str__(self) -> str:
        return f"{self.name} ({self.prefix})"
