"""Documented response shapes for the auth endpoints."""

from __future__ import annotations

from rest_framework import serializers

from .serializers import UserSerializer


class AuthTokenPairSerializer(serializers.Serializer):
    """Returned by `register/` and `token/`."""

    access = serializers.CharField(help_text="Short lived JWT access token.")
    refresh = serializers.CharField(help_text="Long lived JWT refresh token.")
    user = UserSerializer()


class RefreshTokenPairSerializer(serializers.Serializer):
    """Returned by `token/refresh/`.

    `refresh` is only present when `ROTATE_REFRESH_TOKENS` is enabled.
    """

    access = serializers.CharField()
    refresh = serializers.CharField(required=False)
