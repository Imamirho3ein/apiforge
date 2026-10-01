"""ASGI entrypoint: HTTP + WebSocket."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

# Populate the app registry before importing anything that touches models.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from apps.analytics.routing import websocket_urlpatterns  # noqa: E402
from apps.common.middleware import TokenAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # WebSocket connections authenticate with `?token=<jwt>`.
        "websocket": TokenAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
