from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.analytics"
    verbose_name = "Analytics"

    def ready(self) -> None:
        # Import signal handlers so they are registered.
        from . import signals  # noqa: F401
