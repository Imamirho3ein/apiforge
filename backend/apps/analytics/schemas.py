"""Response-only serializers that give the analytics API a documented shape."""

from __future__ import annotations

from rest_framework import serializers


class AnalyticsPeriodSerializer(serializers.Serializer):
    days = serializers.IntegerField(help_text="Size of the aggregation window.")
    since = serializers.DateTimeField(help_text="Inclusive start of the window.")


class SummarySerializer(serializers.Serializer):
    total_requests = serializers.IntegerField()
    success_rate = serializers.FloatField(help_text="Percentage of non-5xx/4xx responses.")
    error_count = serializers.IntegerField()
    avg_latency_ms = serializers.FloatField()
    unique_keys = serializers.IntegerField()
    projects = serializers.IntegerField()
    period = AnalyticsPeriodSerializer()


class TimeseriesPointSerializer(serializers.Serializer):
    bucket = serializers.DateTimeField(allow_null=True)
    total = serializers.IntegerField()
    errors = serializers.IntegerField()


class TimeseriesSerializer(serializers.Serializer):
    interval = serializers.ChoiceField(choices=["hour", "day"])
    points = TimeseriesPointSerializer(many=True)


class StatusClassCountSerializer(serializers.Serializer):
    bucket = serializers.CharField(help_text="2xx, 4xx or 5xx.")
    count = serializers.IntegerField()


class StatusCodeCountSerializer(serializers.Serializer):
    status = serializers.IntegerField()
    count = serializers.IntegerField()


class StatusDistributionSerializer(serializers.Serializer):
    by_class = StatusClassCountSerializer(many=True)
    by_code = StatusCodeCountSerializer(many=True)


class TopEndpointSerializer(serializers.Serializer):
    method = serializers.CharField()
    path = serializers.CharField()
    count = serializers.IntegerField()
    avg_latency_ms = serializers.FloatField()


class TopEndpointsSerializer(serializers.Serializer):
    results = TopEndpointSerializer(many=True)


class APIKeyStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()
    expired = serializers.IntegerField()
    revoked = serializers.IntegerField()
    total_requests = serializers.IntegerField()
