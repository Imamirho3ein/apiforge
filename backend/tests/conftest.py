"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.apis.models import Endpoint
from apps.keys.models import APIKey

from .factories import (
    ApiProjectFactory,
    EndpointFactory,
    RequestLogFactory,
    UserFactory,
)


@pytest.fixture(autouse=True)
def clear_cache():
    """Rate-limit counters must never leak between tests."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def other_user(db):
    return UserFactory()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def auth_client(user, api_client) -> APIClient:
    """Client authenticated as ``user`` with a real access token."""
    token = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return api_client


@pytest.fixture
def project(user):
    return ApiProjectFactory(owner=user, name="Payments API", tags=["payments"])


@pytest.fixture
def endpoint(project):
    return EndpointFactory(
        project=project,
        name="List payments",
        method=Endpoint.Method.GET,
        path="/payments",
        mock_enabled=True,
        mock_status=200,
        mock_body={"data": [{"id": 1}]},
    )


@pytest.fixture
def api_key(user, project):
    """Returns ``(key, plaintext)`` — the plaintext is only available now."""
    key, plaintext = APIKey.generate(user=user, name="Primary", project=project, rate_limit=1000)
    key.save()
    return key, plaintext


@pytest.fixture
def log_factory():
    return RequestLogFactory
