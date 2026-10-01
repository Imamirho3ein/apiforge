"""Analytics aggregation + the log explorer (filters, cursor pagination)."""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import urlencode

import pytest
from django.utils import timezone

from apps.analytics.models import RequestLog
from apps.keys.models import APIKey

from .factories import ApiProjectFactory, EndpointFactory, UserFactory

pytestmark = pytest.mark.django_db

SUMMARY_URL = "/api/analytics/summary/"
TIMESERIES_URL = "/api/analytics/timeseries/"
DISTRIBUTION_URL = "/api/analytics/status-distribution/"
TOP_URL = "/api/analytics/top-endpoints/"
LOGS_URL = "/api/logs/"


def make_logs(project, endpoint, key, **kwargs):
    """Create a log row with sensible defaults for the owner's project."""
    defaults = {
        "owner": project.owner,
        "project": project,
        "endpoint": endpoint,
        "api_key": key,
        "key_name": key.name,
        "endpoint_name": endpoint.name,
        "method": "GET",
        "path": endpoint.path,
        "status_code": 200,
        "latency_ms": 10.0,
    }
    defaults.update(kwargs)
    return RequestLog.objects.create(**defaults)


@pytest.fixture
def dataset(project, endpoint, api_key, user):
    key, _ = api_key
    now = timezone.now()
    for offset_hours, status in [(0, 200), (1, 200), (2, 404), (25, 500), (50, 200)]:
        make_logs(
            project,
            endpoint,
            key,
            status_code=status,
            latency_ms=25.0,
            created_at=now - timedelta(hours=offset_hours),
        )
    return project


class TestSummary:
    def test_counts_and_success_rate(self, auth_client, dataset):
        response = auth_client.get(SUMMARY_URL)

        assert response.status_code == 200
        body = response.json()
        assert body["total_requests"] == 5
        assert body["error_count"] == 2
        assert body["success_rate"] == 60.0
        assert body["avg_latency_ms"] == 25.0
        assert body["unique_keys"] == 1
        assert body["period"]["days"] == 7

    def test_respects_days_window(self, auth_client, dataset):
        # Only the 3 recent rows (0h, 1h, 2h ago) are inside a 1-day window.
        response = auth_client.get(f"{SUMMARY_URL}?days=1")
        assert response.json()["total_requests"] == 3

    def test_filters_by_project(self, auth_client, dataset, user):
        other = ApiProjectFactory(owner=user, name="Other")
        response = auth_client.get(f"{SUMMARY_URL}?project={other.id}")
        assert response.json()["total_requests"] == 0

    def test_isolates_tenants(self, auth_client, dataset):
        stranger = UserFactory()
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken

        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(stranger).access_token}"
        )
        assert client.get(SUMMARY_URL).json()["total_requests"] == 0

    def test_requires_authentication(self, api_client):
        assert api_client.get(SUMMARY_URL).status_code == 401


class TestTimeseries:
    def test_buckets_by_hour(self, auth_client, dataset):
        response = auth_client.get(f"{TIMESERIES_URL}?interval=hour&days=1")

        assert response.status_code == 200
        body = response.json()
        assert body["interval"] == "hour"
        # Rows live at 0h, 1h, 2h, 25h and 50h ago — only the first three
        # fall inside the 24h window.
        assert sum(point["total"] for point in body["points"]) == 3
        assert any(point["errors"] for point in body["points"])

    def test_buckets_by_day(self, auth_client, dataset):
        body = auth_client.get(f"{TIMESERIES_URL}?interval=day&days=7").json()
        assert body["interval"] == "day"
        assert sum(point["total"] for point in body["points"]) == 5

    def test_rejects_unknown_interval(self, auth_client, dataset):
        response = auth_client.get(f"{TIMESERIES_URL}?interval=week")
        assert response.status_code == 400


class TestDistributionAndTop:
    def test_status_distribution(self, auth_client, dataset):
        body = auth_client.get(DISTRIBUTION_URL).json()

        assert {row["bucket"]: row["count"] for row in body["by_class"]} == {
            "2xx": 3,
            "4xx": 1,
            "5xx": 1,
        }
        assert {row["status"]: row["count"] for row in body["by_code"]} == {
            200: 3,
            404: 1,
            500: 1,
        }

    def test_top_endpoints(self, auth_client, dataset, project):
        second = EndpointFactory(project=project, path="/health", method="GET")
        key = APIKey.objects.first()
        make_logs(project, second, key, path="/health", endpoint_name="Health check")

        rows = auth_client.get(TOP_URL).json()["results"]

        assert rows[0]["count"] == 5
        assert rows[0]["path"] == "/payments"
        assert rows[1]["count"] == 1
        assert rows[1]["path"] == "/health"


class TestLogExplorer:
    def test_cursor_pagination(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        for index in range(7):
            make_logs(
                project,
                endpoint,
                key,
                created_at=timezone.now() - timedelta(minutes=index),
            )

        first = auth_client.get(LOGS_URL).json()
        assert len(first["results"]) == 7  # default page size 25

        # Force a small page to exercise the cursor.
        page1 = auth_client.get(f"{LOGS_URL}?page_size=3").json()
        assert len(page1["results"]) == 3
        assert page1["next"]

        page2 = auth_client.get(page1["next"]).json()
        assert len(page2["results"]) == 3
        assert {row["id"] for row in page1["results"]} & {
            row["id"] for row in page2["results"]
        } == set()

    def test_search_filter(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        make_logs(project, endpoint, key, path="/alpha")
        make_logs(project, endpoint, key, path="/beta")

        body = auth_client.get(f"{LOGS_URL}?search=alpha").json()

        assert [row["path"] for row in body["results"]] == ["/alpha"]

    def test_status_class_filter(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        make_logs(project, endpoint, key, status_code=200)
        make_logs(project, endpoint, key, status_code=500)

        body = auth_client.get(f"{LOGS_URL}?status_class=5xx").json()

        assert [row["status_code"] for row in body["results"]] == [500]

    def test_method_and_time_filters(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        make_logs(project, endpoint, key, method="POST")
        make_logs(project, endpoint, key, method="GET")

        query = urlencode(
            {
                "method": "POST",
                "since": (timezone.now() - timedelta(minutes=1)).isoformat(),
            }
        )
        body = auth_client.get(f"{LOGS_URL}?{query}").json()

        assert len(body["results"]) == 1
        assert body["results"][0]["method"] == "POST"

    def test_only_own_logs(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        make_logs(project, endpoint, key)

        foreign = ApiProjectFactory()
        foreign_key = APIKey.objects.create(
            user=foreign.owner, name="Theirs", prefix="af_live_zzz", key_hash="0" * 64
        )
        make_logs(foreign, EndpointFactory(project=foreign), foreign_key)

        assert len(auth_client.get(LOGS_URL).json()["results"]) == 1

    def test_envelope_excludes_count(self, auth_client, project, endpoint, api_key):
        key, _ = api_key
        make_logs(project, endpoint, key)
        body = auth_client.get(LOGS_URL).json()
        assert "count" not in body
        assert set(body) == {"next", "previous", "results"}
