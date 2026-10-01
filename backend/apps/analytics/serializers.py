"""Serializers for request logs."""

from __future__ import annotations

from rest_framework import serializers

from .models import RequestLog


class RequestLogSerializer(serializers.ModelSerializer):
    # `*_id` sources render UUIDs as strings. A plain PrimaryKeyRelatedField
    # returns raw `uuid.UUID` objects, which the WebSocket's json.dumps()
    # cannot serialise.
    project = serializers.UUIDField(source="project_id", read_only=True)
    endpoint = serializers.UUIDField(source="endpoint_id", read_only=True)
    api_key = serializers.UUIDField(source="api_key_id", read_only=True)
    # allow_null matters: logs survive project/key deletion (SET_NULL).
    project_name = serializers.CharField(source="project.name", read_only=True, allow_null=True)
    endpoint_name = serializers.CharField(read_only=True)
    key_name = serializers.CharField(read_only=True)

    class Meta:
        model = RequestLog
        fields = [
            "id",
            "project",
            "project_name",
            "endpoint",
            "endpoint_name",
            "method",
            "path",
            "status_code",
            "latency_ms",
            "api_key",
            "key_name",
            "ip_address",
            "user_agent",
            "created_at",
        ]
        read_only_fields = fields
