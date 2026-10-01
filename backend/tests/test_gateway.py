"""The public gateway: authentication, routing, rate limits, logging."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.analytics.models import RequestLog
from apps.apis.models import Endpoint
from apps.keys.models import APIKey

from .factories import ApiProjectFactory, EndpointFactory, UserFactory

pytestmark = pytest.mark.django_db


def url(project, path: str = "/payments") -> str:
    return f"/gateway/{project.slug}{path}"


class TestAuthentication:
    def test_missing_key_is_401(self, api_client, project):
        response = api_client.get(url(project))
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "api_key_required"

    def test_unknown_key_is_401(self, api_client, project):
        response = api_client.get(url(project), HTTP_X_API_KEY="af_live_nope")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_api_key"

    def test_tampered_secret_is_401(self, api_client, project, api_key):
        _, plaintext = api_key
        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext + "x")
        assert response.status_code == 401

    def test_revoked_key_is_403(self, api_client, project, api_key):
        key, plaintext = api_key
        key.is_active = False
        key.save()

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "key_revoked"

    def test_expired_key_is_403(self, api_client, project, user):
        key, plaintext = APIKey.generate(
            user=user, project=project, expires_at=timezone.now() - timedelta(hours=1)
        )
        key.save()

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "key_expired"

    def test_key_bound_to_other_project_is_403(self, api_client, project, user):
        other = ApiProjectFactory(owner=user)
        key, plaintext = APIKey.generate(user=user, project=other)
        key.save()

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "key_scope_mismatch"

    def test_authorization_header_is_supported(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        response = api_client.get(url(project), HTTP_AUTHORIZATION=f"ApiKey {plaintext}")
        assert response.status_code == 200

    def test_unscoped_key_works_on_every_project(self, api_client, project, endpoint, user):
        key, plaintext = APIKey.generate(user=user, project=None)
        key.save()

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 200

    def test_another_users_project_is_404(self, api_client, user, api_key):
        _, plaintext = api_key
        foreign = ApiProjectFactory(owner=UserFactory(), name="Foreign")
        EndpointFactory(project=foreign, path="/payments")
        response = api_client.get(url(foreign), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 404


class TestRouting:
    def test_serves_mock_response(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 200
        assert response.json() == {"data": [{"id": 1}]}
        assert response["X-Request-Id"]
        assert float(response["X-Gateway-Latency-Ms"]) >= 0
        assert response["X-RateLimit-Limit"] == "1000"

    def test_unknown_path_is_404(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        response = api_client.get(url(project, "/nope"), HTTP_X_API_KEY=plaintext)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "endpoint_not_found"

    def test_inactive_endpoint_is_404(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        endpoint.is_active = False
        endpoint.save()

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 404

    def test_wrong_method_is_404(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        response = api_client.post(url(project), {}, HTTP_X_API_KEY=plaintext)
        assert response.status_code == 404

    def test_mock_can_return_error_status(self, api_client, project, user):
        EndpointFactory(project=project, path="/boom", mock_status=503, mock_body={"error": "down"})
        key, plaintext = APIKey.generate(user=user, project=project)
        key.save()

        response = api_client.get(url(project, "/boom"), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 503
        assert response.json() == {"error": "down"}

    def test_no_backend_configured_is_501(self, api_client, project, user):
        endpoint = EndpointFactory(project=project, path="/empty", mock_enabled=False)
        endpoint.target_url = ""
        endpoint.save()
        key, plaintext = APIKey.generate(user=user, project=project)
        key.save()

        response = api_client.get(url(project, "/empty"), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 501
        assert response.json()["error"]["code"] == "no_backend_configured"

    def test_blocks_private_upstream_targets(self, api_client, project, user, settings):
        settings.ALLOW_PRIVATE_UPSTREAM = False
        EndpointFactory(
            project=project,
            path="/internal",
            mock_enabled=False,
            target_url="http://127.0.0.1:9999/secrets",
        )
        key, plaintext = APIKey.generate(user=user, project=project)
        key.save()

        response = api_client.get(url(project, "/internal"), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 502


class TestRateLimit:
    def test_returns_429_with_retry_after(self, api_client, project, user):
        EndpointFactory(project=project, path="/limited")
        key, plaintext = APIKey.generate(user=user, project=project, rate_limit=2)
        key.save()

        for _ in range(2):
            assert (
                api_client.get(url(project, "/limited"), HTTP_X_API_KEY=plaintext).status_code
                == 200
            )

        response = api_client.get(url(project, "/limited"), HTTP_X_API_KEY=plaintext)

        assert response.status_code == 429
        assert response.json()["error"]["code"] == "rate_limited"
        assert int(response["Retry-After"]) > 0
        assert response["X-RateLimit-Remaining"] == "0"

    def test_limit_is_per_key(self, api_client, project, user):
        EndpointFactory(project=project, path="/limited")
        limited, text_a = APIKey.generate(user=user, project=project, rate_limit=1)
        limited.save()
        generous, text_b = APIKey.generate(user=user, project=project, rate_limit=100)
        generous.save()

        assert api_client.get(url(project, "/limited"), HTTP_X_API_KEY=text_a).status_code == 200
        assert api_client.get(url(project, "/limited"), HTTP_X_API_KEY=text_a).status_code == 429
        # A different key has its own bucket.
        assert api_client.get(url(project, "/limited"), HTTP_X_API_KEY=text_b).status_code == 200


class TestLogging:
    def test_request_is_logged(self, api_client, project, endpoint, user, api_key):
        key, plaintext = api_key

        response = api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        log = RequestLog.objects.get()
        assert log.method == "GET"
        assert log.path == "/payments"
        assert log.status_code == 200
        assert log.owner == user
        assert log.project == project
        assert log.endpoint == endpoint
        assert log.api_key == key
        assert log.key_name == key.name
        assert log.endpoint_name == endpoint.name
        assert log.latency_ms >= 0
        assert response["X-Request-Id"] == str(log.id)

    def test_counters_are_incremented(self, api_client, project, endpoint, api_key):
        key, plaintext = api_key

        for _ in range(3):
            api_client.get(url(project), HTTP_X_API_KEY=plaintext)

        endpoint.refresh_from_db()
        key.refresh_from_db()
        assert endpoint.request_count == 3
        assert key.total_requests == 3
        assert key.last_used_at is not None

    def test_failed_routing_is_not_logged(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        api_client.get(url(project, "/missing"), HTTP_X_API_KEY=plaintext)
        assert not RequestLog.objects.exists()

    def test_user_agent_is_captured(self, api_client, project, endpoint, api_key):
        _, plaintext = api_key
        api_client.get(url(project), HTTP_X_API_KEY=plaintext, HTTP_USER_AGENT="pytest-agent")
        assert RequestLog.objects.get().user_agent == "pytest-agent"
