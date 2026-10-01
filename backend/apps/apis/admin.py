from django.contrib import admin

from .models import ApiProject, Endpoint


class EndpointInline(admin.TabularInline):
    model = Endpoint
    extra = 0
    fields = ("method", "path", "name", "is_active", "mock_enabled", "request_count")
    readonly_fields = ("request_count",)


@admin.register(ApiProject)
class ApiProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "slug", "is_public", "created_at")
    search_fields = ("name", "slug", "owner__email")
    list_filter = ("is_public", "created_at")
    readonly_fields = ("slug", "gateway_base_url")
    inlines = [EndpointInline]


@admin.register(Endpoint)
class EndpointAdmin(admin.ModelAdmin):
    list_display = ("method", "path", "name", "project", "is_active", "request_count")
    list_filter = ("method", "is_active", "mock_enabled")
    search_fields = ("path", "name", "project__name")
    readonly_fields = ("request_count",)
