from django.contrib import admin

from .models import APIKey


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "project", "prefix", "is_active", "status", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("name", "prefix", "user__email")
    readonly_fields = ("prefix", "key_hash", "masked_key", "last_used_at", "total_requests")
