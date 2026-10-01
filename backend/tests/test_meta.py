"""Health check, SPA hosting, error envelope and OpenAPI schema availability."""

from __future__ import annotations

import pytest
from django.test import override_settings

pytestmark = pytest.mark.django_db


def test_health_is_public_and_reports_database(api_client):
    response = api_client.get("/api/health/")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["version"]


def test_openapi_schema_is_generated(client, db):
    """The schema must be valid OpenAPI 3 (drf-spectacular)."""
    response = client.get("/api/schema/?format=json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["openapi"].startswith("3.")
    assert schema["info"]["title"] == "APIForge"
    paths = schema["paths"]
    assert "/api/projects/" in paths
    assert "/api/keys/" in paths
    assert "/api/analytics/summary/" in paths
    assert "/api/logs/" in paths


def test_swagger_ui_is_served(client):
    assert client.get("/api/docs/").status_code == 200


def test_unknown_route_returns_json_404(api_client):
    response = api_client.get("/api/does-not-exist/")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --------------------------------------------------------------------------
# Single-container SPA hosting (Liara / PaaS deployments)
# --------------------------------------------------------------------------
SPA_URLS = {"ROOT_URLCONF": "tests.urls_spa"}


@pytest.fixture
def spa_bundle(tmp_path, settings):
    """Point the SPA view at a throwaway index.html."""
    index = tmp_path / "index.html"
    index.write_text('<!doctype html><div id="root"></div>', encoding="utf-8")
    settings.SPA_INDEX_FILE = index
    return index


@override_settings(**SPA_URLS)
def test_spa_shell_is_served_for_client_routes(client, spa_bundle):
    response = client.get("/projects/8f1b0e2a-0000-4000-8000-000000000000")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/html")
    assert b'<div id="root">' in b"".join(response.streaming_content)
    # The shell must never be cached, or clients pin a stale asset manifest.
    assert "no-cache" in response["Cache-Control"]


@override_settings(**SPA_URLS)
def test_spa_catch_all_does_not_swallow_the_api(client, spa_bundle):
    assert client.get("/api/health/").status_code == 200
    assert client.get("/api/nope/").status_code == 404


@override_settings(**SPA_URLS)
def test_missing_bundle_reports_503_instead_of_crashing(client, settings, tmp_path):
    settings.SPA_INDEX_FILE = tmp_path / "missing.html"

    response = client.get("/dashboard")

    assert response.status_code == 503
    assert b"frontend bundle is missing" in response.content
