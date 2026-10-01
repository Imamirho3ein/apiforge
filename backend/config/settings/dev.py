"""Development settings: local SQLite, debug toolbar-free, verbose errors."""

from .base import *  # noqa: F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Easiest local experience: the Vite dev server proxies /api, so CORS is
# allowed for the direct origin too.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", True)  # noqa: F405

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
