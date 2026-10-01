"""Serializers for API keys — the plaintext secret is write-once."""

from __future__ import annotations

from rest_framework import serializers

from .models import APIKey


class APIKeySerializer(serializers.ModelSerializer):
    """List/detail representation — never exposes the secret."""

    masked_key = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True, allow_null=True)

    class Meta:
        model = APIKey
        fields = [
            "id",
            "name",
            "prefix",
            "masked_key",
            "project",
            "project_name",
            "scopes",
            "rate_limit",
            "is_active",
            "status",
            "expires_at",
            "last_used_at",
            "total_requests",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "prefix",
            "masked_key",
            "is_active",
            "status",
            "last_used_at",
            "total_requests",
            "created_at",
        ]


class APIKeyCreateSerializer(APIKeySerializer):
    """Create/rotate representation — returns the plaintext exactly once."""

    api_key = serializers.SerializerMethodField()

    class Meta(APIKeySerializer.Meta):
        fields = [*APIKeySerializer.Meta.fields, "api_key"]
        read_only_fields = [*APIKeySerializer.Meta.read_only_fields, "api_key"]

    def get_api_key(self, obj) -> str | None:
        return getattr(obj, "_plaintext", None)

    def validate_project(self, project) -> object:
        request = self.context.get("request")
        if request and project is not None and project.owner_id != request.user.id:
            raise serializers.ValidationError("You do not own this project.")
        return project

    def validate_scopes(self, value) -> list[str]:
        valid = {choice[0] for choice in APIKey.Scopes.choices}
        unknown = set(value) - valid
        if unknown:
            raise serializers.ValidationError(f"Unknown scopes: {', '.join(sorted(unknown))}.")
        return value

    def validate_rate_limit(self, value: int) -> int:
        if value < 1 or value > 10000:
            raise serializers.ValidationError(
                "Rate limit must be between 1 and 10000 requests/minute."
            )
        return value
