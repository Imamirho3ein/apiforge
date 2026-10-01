from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("email", "username", "company", "is_staff", "date_joined")
    search_fields = ("email", "username", "company")
    ordering = ("-date_joined",)
    fieldsets = (
        *DjangoUserAdmin.fieldsets,
        ("Profile", {"fields": ("company", "bio", "avatar_url")}),
    )
    add_fieldsets = (*DjangoUserAdmin.add_fieldsets, ((None, {"fields": ("email",)})))
