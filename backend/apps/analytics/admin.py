from django.contrib import admin

from .models import RequestLog


@admin.register(RequestLog)
class RequestLogAdmin(admin.ModelAdmin):
    list_display = ("method", "path", "status_code", "latency_ms", "project", "created_at")
    list_filter = ("method", "status_code", "created_at")
    search_fields = ("path", "key_name", "ip_address")
    readonly_fields = [field.name for field in RequestLog._meta.fields]
