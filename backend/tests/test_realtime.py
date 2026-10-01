"""Realtime layer: WebSocket consumer + token middleware.

These tests use the in-memory channel layer and a stub user, so they stay
fast and never touch the database from a worker thread. The ``django_db``
mark is still required: ``async_to_sync`` closes old connections in its
worker thread, which trips pytest-django's database blocker.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser

from apps.analytics.consumers import LogConsumer
from apps.analytics.models import RequestLog
from apps.analytics.serializers import RequestLogSerializer
from apps.common.middleware import TokenAuthMiddleware

from .factories import ApiProjectFactory, EndpointFactory, UserFactory

pytestmark = pytest.mark.django_db


def stub_user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), is_authenticated=True)


def make_log() -> RequestLog:
    """A fully populated log row — the same one the gateway would write."""
    owner = UserFactory()
    project = ApiProjectFactory(owner=owner)
    endpoint = EndpointFactory(project=project, path="/payments")
    return RequestLog.objects.create(
        owner=owner,
        project=project,
        endpoint=endpoint,
        method="GET",
        path="/payments",
        status_code=200,
        latency_ms=12.5,
        endpoint_name=endpoint.name,
        key_name="Production key",
    )


class TestLogConsumer:
    def test_rejects_anonymous_with_4401(self):
        async def run() -> None:
            communicator = WebsocketCommunicator(LogConsumer.as_asgi(), "/ws/logs/")
            communicator.scope["user"] = AnonymousUser()
            connected, _ = await communicator.connect()
            assert connected is False

        async_to_sync(run)()

    def test_streams_group_events_as_log_created(self):
        user = stub_user()

        async def run() -> None:
            communicator = WebsocketCommunicator(LogConsumer.as_asgi(), "/ws/logs/")
            communicator.scope["user"] = user
            connected, _ = await communicator.connect()
            assert connected is True

            await get_channel_layer().group_send(
                f"logs_user_{user.id}",
                {"type": "log.event", "payload": {"id": "abc", "method": "GET"}},
            )
            message = await communicator.receive_json_from(timeout=3)
            assert message["type"] == "log.created"
            assert message["data"]["method"] == "GET"
            await communicator.disconnect()

        async_to_sync(run)()

    def test_leaves_the_group_on_disconnect(self):
        user = stub_user()

        async def run() -> None:
            layer = get_channel_layer()
            communicator = WebsocketCommunicator(LogConsumer.as_asgi(), "/ws/logs/")
            communicator.scope["user"] = user
            await communicator.connect()
            group = f"logs_user_{user.id}"
            assert any(group in key for key in layer.groups)
            await communicator.disconnect()
            assert not any(group in key for key in layer.groups)

        async_to_sync(run)()

    def test_real_log_payload_is_json_serialisable(self):
        """Regression: raw UUID objects broke the consumer's json.dumps().

        Every value in the broadcast payload must be a JSON primitive,
        otherwise the websocket closes instead of delivering the event.
        """
        payload = RequestLogSerializer(make_log()).data

        assert json.loads(json.dumps(payload)) == payload
        assert isinstance(payload["project"], str)
        assert isinstance(payload["endpoint"], str)
        assert payload["project"] == str(payload["project"])

    def test_delivers_a_real_serialised_log(self):
        """The full path: serializer output -> group -> websocket client."""
        log = make_log()
        user = SimpleNamespace(id=log.owner_id, is_authenticated=True)

        async def run() -> None:
            communicator = WebsocketCommunicator(LogConsumer.as_asgi(), "/ws/logs/")
            communicator.scope["user"] = user
            assert (await communicator.connect())[0] is True

            await get_channel_layer().group_send(
                f"logs_user_{user.id}",
                {"type": "log.event", "payload": RequestLogSerializer(log).data},
            )
            message = await communicator.receive_json_from(timeout=3)
            assert message["type"] == "log.created"
            assert message["data"]["path"] == "/payments"
            assert message["data"]["status_code"] == 200
            assert message["data"]["project"] == str(log.project_id)
            await communicator.disconnect()

        async_to_sync(run)()


class TestTokenAuthMiddleware:
    def test_resolves_user_from_query_string(self, monkeypatch):
        user = stub_user()
        seen: dict = {}

        async def fake_resolver(token: str):
            seen["token"] = token
            return user

        monkeypatch.setattr("apps.common.middleware._user_for_token", fake_resolver)

        async def inner_app(scope, receive, send):
            seen["user"] = scope.get("user")

        async def run() -> None:
            middleware = TokenAuthMiddleware(inner_app)
            await middleware({"type": "websocket", "query_string": b"token=abc.def"}, None, None)

        async_to_sync(run)()

        assert seen["token"] == "abc.def"
        assert seen["user"] is user

    def test_falls_back_to_anonymous_without_token(self, monkeypatch):
        seen: dict = {}

        async def inner_app(scope, receive, send):
            seen["user"] = scope.get("user")

        async def run() -> None:
            middleware = TokenAuthMiddleware(inner_app)
            await middleware({"type": "websocket", "query_string": b""}, None, None)

        async_to_sync(run)()

        assert isinstance(seen["user"], AnonymousUser)
