"""WebSocket authentication middleware.

Browsers cannot set headers on a WebSocket handshake, so the JWT travels in
the query string: ``ws://host/ws/logs/?token=<access>``.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@sync_to_async
def _user_for_token(token: str):
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        access = AccessToken(token)
        return get_user_model().objects.get(id=access["user_id"])
    except Exception:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    """Resolve ``scope["user"]`` from the ``token`` query parameter."""

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            scope = dict(scope)
            query = parse_qs(scope.get("query_string", b"").decode("utf-8", errors="ignore"))
            token = (query.get("token") or [""])[0]
            scope["user"] = await _user_for_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)
