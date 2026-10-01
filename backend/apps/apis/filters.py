"""Filters for projects and endpoints."""

from django_filters import rest_framework as filters

from .models import ApiProject, Endpoint


class ApiProjectFilter(filters.FilterSet):
    tag = filters.CharFilter(method="filter_tag")
    is_public = filters.BooleanFilter()

    class Meta:
        model = ApiProject
        fields = ["tag", "is_public"]

    def filter_tag(self, queryset, name, value):
        # `tags_text` looks like ",payments,public," — the trailing comma
        # guarantees exact tag matches without backend-specific JSON ops.
        return queryset.filter(tags_text__icontains=f",{value},")


class EndpointFilter(filters.FilterSet):
    method = filters.CharFilter()
    project = filters.UUIDFilter(field_name="project_id")
    is_active = filters.BooleanFilter()

    class Meta:
        model = Endpoint
        fields = ["method", "project", "is_active"]
