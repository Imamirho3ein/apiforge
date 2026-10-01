"""Filters for the log explorer."""

from __future__ import annotations

from django_filters import rest_framework as filters

from .models import RequestLog


class RequestLogFilter(filters.FilterSet):
    project = filters.UUIDFilter(field_name="project_id")
    method = filters.CharFilter()
    status_class = filters.ChoiceFilter(
        choices=[("2xx", "2xx"), ("4xx", "4xx"), ("5xx", "5xx")],
        method="filter_status_class",
    )
    min_status = filters.NumberFilter(field_name="status_code", lookup_expr="gte")
    max_status = filters.NumberFilter(field_name="status_code", lookup_expr="lte")
    since = filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")
    until = filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = RequestLog
        fields = ["project", "method", "status_class", "min_status", "max_status", "since", "until"]

    def filter_status_class(self, queryset, name, value):
        if value == "2xx":
            return queryset.filter(status_code__gte=200, status_code__lt=300)
        if value == "4xx":
            return queryset.filter(status_code__gte=400, status_code__lt=500)
        if value == "5xx":
            return queryset.filter(status_code__gte=500, status_code__lt=600)
        return queryset
