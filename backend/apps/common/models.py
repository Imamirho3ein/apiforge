"""Reusable abstract models."""

from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """UUID primary key + explicit ``created_at`` (settable, indexed).

    ``created_at`` uses ``default=timezone.now`` instead of ``auto_now_add``
    so historical fixtures/seeds can back-date rows — useful for the demo
    data seeder and for analytics tests.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def __str__(self) -> str:  # pragma: no cover - trivial
        return str(self.pk)
