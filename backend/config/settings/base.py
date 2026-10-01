"""Base settings shared by every environment.

Everything environment-specific is read from OS variables so the same code
runs on a laptop (SQLite, in-memory channel layer) and in Docker
(PostgreSQL, Redis).
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import dj_database_url

# --------------------------------------------------------------------------
# Paths & helpers
# --------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default)


# --------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------
SECRET_KEY = env_str("DJANGO_SECRET_KEY", "insecure-dev-secret-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

VERSION = "1.0.0"

INSTALLED_APPS = [
    # Daphne first => `manage.py runserver` speaks ASGI (WebSockets).
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    "channels",
    # Local apps
    "apps.common",
    "apps.accounts",
    "apps.apis",
    "apps.keys",
    "apps.analytics",
    "apps.gateway",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --------------------------------------------------------------------------
# Database
#   1. DATABASE_URL           -> whatever dj-database-url understands
#   2. POSTGRES_HOST           -> discrete PostgreSQL settings (docker-compose)
#   3. otherwise               -> SQLite, zero-config local development
# --------------------------------------------------------------------------
if os.getenv("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.parse(
            os.environ["DATABASE_URL"],
            conn_max_age=60,
            conn_health_checks=True,
        )
    }
elif os.getenv("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env_str("POSTGRES_DB", "apiforge"),
            "USER": env_str("POSTGRES_USER", "apiforge"),
            "PASSWORD": env_str("POSTGRES_PASSWORD", "apiforge"),
            "HOST": env_str("POSTGRES_HOST", "db"),
            "PORT": env_str("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

# --------------------------------------------------------------------------
# Password validation
# --------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --------------------------------------------------------------------------
# Internationalisation
# --------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = env_str("TZ", "UTC")
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------
# Static & media files
# --------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if not DEBUG
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        ),
    },
}

# --------------------------------------------------------------------------
# Single-container SPA hosting
#   The production image builds the React app and drops it in
#   `static/spa`. WhiteNoise serves `/assets/*` from there and Django serves
#   `index.html` for every non-API route, so one ASGI process answers
#   `/api/*`, `/ws/*`, `/gateway/*` and the whole SPA on a single port —
#   which is what a PaaS such as Liara expects.
#   During local development Vite serves the SPA instead, so this is off.
# --------------------------------------------------------------------------
SPA_DIST_DIR = BASE_DIR / "static" / "spa"
SPA_INDEX_FILE = SPA_DIST_DIR / "index.html"
if SPA_DIST_DIR.is_dir():
    WHITENOISE_ROOT = SPA_DIST_DIR
SERVE_SPA = env_bool("SERVE_SPA", default=SPA_INDEX_FILE.is_file())

# --------------------------------------------------------------------------
# REST Framework
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "600/min",
        # Scoped rates used explicitly on the auth endpoints.
        "auth": "10/min",
    },
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
}

# NB: simplejwt reads the `SIMPLE_JWT` key (with the underscore).
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "APIForge",
    "DESCRIPTION": (
        "APIForge — build, secure, mock and monitor your APIs. "
        "Management API for projects, endpoints, API keys, analytics and live logs."
    ),
    "VERSION": VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api",
    "TAGS": [
        {"name": "auth", "description": "Registration, JWT tokens, profile"},
        {"name": "projects", "description": "API projects"},
        {"name": "endpoints", "description": "Endpoints of a project"},
        {"name": "keys", "description": "API keys (issue, rotate, revoke)"},
        {"name": "analytics", "description": "Aggregated usage statistics"},
        {"name": "logs", "description": "Request log explorer (cursor paginated)"},
    ],
}

# --------------------------------------------------------------------------
# CORS (the React dev server runs on another origin)
# --------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOW_CREDENTIALS = False  # pure JWT auth, no cookies needed

# --------------------------------------------------------------------------
# Redis / channel layer / cache
#   REDIS_URL set  -> shared rate limits + websockets across workers
#   REDIS_URL empty -> in-process (perfect for local dev & tests)
# --------------------------------------------------------------------------
REDIS_URL = env_str("REDIS_URL", "")

if REDIS_URL:
    _redis = urlparse(REDIS_URL)
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [
                    {
                        "host": _redis.hostname or "localhost",
                        "port": _redis.port or 6379,
                        "db": int((_redis.path or "/0").strip("/") or 0),
                        "password": _redis.password,
                        "username": _redis.username,
                    }
                ],
            },
        },
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "apiforge",
        }
    }

# --------------------------------------------------------------------------
# Gateway
# --------------------------------------------------------------------------
GATEWAY_BASE_URL = env_str("GATEWAY_BASE_URL", "http://localhost:8000").rstrip("/")
# Private/loopback upstreams are only allowed while DEBUG is on (SSRF guard).
ALLOW_PRIVATE_UPSTREAM = env_bool("ALLOW_PRIVATE_UPSTREAM", default=DEBUG)

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"level": env_str("DJANGO_LOG_LEVEL", "INFO"), "propagate": True},
        "apps": {"level": env_str("APP_LOG_LEVEL", "INFO"), "propagate": True},
    },
}
