"""Custom user model — email is the login identifier."""

from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    # UUID primary key, consistent with every other model in the project
    # (`common.models.TimeStampedModel`) and with `docs/api-contract.md`.
    # It also keeps user identifiers out of JWT payloads as sequential ints.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    email = models.EmailField("email address", unique=True)
    company = models.CharField(max_length=120, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        ordering = ("-date_joined",)

    def __str__(self) -> str:
        return self.email
