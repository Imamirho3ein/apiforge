"""Serializers for projects and endpoints."""

from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.common.utils import unique_slug

from .models import ApiProject, Endpoint


class ApiProjectSerializer(serializers.ModelSerializer):
    endpoints_count = serializers.IntegerField(read_only=True, default=0)
    gateway_base_url = serializers.SerializerMethodField()

    class Meta:
        model = ApiProject
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "base_path",
            "is_public",
            "tags",
            "endpoints_count",
            "gateway_base_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_gateway_base_url(self, obj) -> str:
        return f"{settings.GATEWAY_BASE_URL}/gateway/{obj.slug}"

    def validate_tags(self, value) -> list[str]:
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise serializers.ValidationError("Tags must be a list of strings.")
        return [item.strip()[:40] for item in value if item.strip()][:10]

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def create(self, validated_data) -> ApiProject:
        """Slugs are server generated and unique per owner."""
        validated_data.pop("slug", None)
        project = ApiProject(**validated_data)
        project.slug = unique_slug(project, project.name)
        project.save()
        return project


class EndpointSerializer(serializers.ModelSerializer):
    gateway_url = serializers.SerializerMethodField()

    class Meta:
        model = Endpoint
        fields = [
            "id",
            "project",
            "name",
            "method",
            "path",
            "description",
            "is_active",
            "mock_enabled",
            "mock_status",
            "mock_body",
            "target_url",
            "request_count",
            "gateway_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "request_count", "created_at", "updated_at"]

    def get_gateway_url(self, obj) -> str:
        return f"{obj.project.gateway_base_url}{obj.path}"

    def validate_project(self, project: ApiProject) -> ApiProject:
        """Only endpoints inside the caller's own projects are allowed."""
        request = self.context.get("request")
        if request and project.owner_id != request.user.id:
            raise serializers.ValidationError("You do not own this project.")
        return project

    def validate(self, attrs) -> dict:
        attrs = super().validate(attrs)
        instance = self.instance
        mock_enabled = attrs.get("mock_enabled", instance.mock_enabled if instance else False)
        target_url = attrs.get("target_url", instance.target_url if instance else "")
        if not mock_enabled and not target_url:
            raise serializers.ValidationError(
                {"target_url": ("Enable mock mode or provide an upstream target URL.")}
            )
        path = attrs.get("path", instance.path if instance else "")
        if path and not path.startswith("/"):
            raise serializers.ValidationError({"path": "Path must start with '/'."})
        return attrs

    def create(self, validated_data) -> Endpoint:
        path = validated_data["path"].strip()
        validated_data["path"] = path if path != "/" else "/"
        return super().create(validated_data)
