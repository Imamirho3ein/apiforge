"""Test settings: fast, isolated, deterministic.

Usage:  pytest --ds=config.settings.test
Set TEST_DB_ENGINE=postgres (plus POSTGRES_* vars) to run the same suite
against PostgreSQL — that is what CI does.
"""

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "test-secret-key"

# Fast hashing — we are not testing password strength here.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

if env_str("TEST_DB_ENGINE").lower() == "postgres":  # noqa: F405
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env_str("POSTGRES_DB", "apiforge_test"),  # noqa: F405
            "USER": env_str("POSTGRES_USER", "apiforge"),  # noqa: F405
            "PASSWORD": env_str("POSTGRES_PASSWORD", "apiforge"),  # noqa: F405
            "HOST": env_str("POSTGRES_HOST", "localhost"),  # noqa: F405
            "PORT": env_str("POSTGRES_PORT", "5432"),  # noqa: F405
        }
    }
else:
    # In-memory SQLite keeps the suite fast and parallel-safe.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

# Deterministic, process-local realtime + caching.
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Rate limits are asserted explicitly in tests — keep them out of the way
# unless a test opts in via `override_settings`.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405 - inherited from base via star import
    "DEFAULT_THROTTLE_RATES": {
        "anon": "10000/min",
        "user": "10000/min",
        "auth": "10000/min",
    },
}
