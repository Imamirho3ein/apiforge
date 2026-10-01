"""Projects & endpoints: CRUD, ownership isolation, filtering."""

from __future__ import annotations

import pytest

from apps.apis.models import ApiProject, Endpoint

from .factories import ApiProjectFactory, EndpointFactory, UserFactory

pytestmark = pytest.mark.django_db

PROJECTS_URL = "/api/projects/"
ENDPOINTS_URL = "/api/endpoints/"


class TestProjects:
    def test_create_generates_slug_and_ownership(self, auth_client, user):
        response = auth_client.post(
            PROJECTS_URL,
            {"name": "Payments API", "description": "money", "tags": ["billing"]},
            format="json",
        )

        assert response.status_code == 201
        body = response.json()
        assert body["slug"] == "payments-api"
        assert body["endpoints_count"] == 0
        assert body["tags"] == ["billing"]
        assert ApiProject.objects.get().owner == user

    def test_slug_is_unique_across_projects(self, auth_client):
        first = auth_client.post(PROJECTS_URL, {"name": "Same Name"}, format="json").json()
        second = auth_client.post(PROJECTS_URL, {"name": "Same Name"}, format="json").json()
        assert first["slug"] != second["slug"]

    def test_list_only_returns_own_projects(self, auth_client, user):
        ApiProjectFactory(owner=user, name="Mine")
        ApiProjectFactory(owner=UserFactory(), name="Theirs")

        response = auth_client.get(PROJECTS_URL)

        assert response.status_code == 200
        names = [item["name"] for item in response.json()["results"]]
        assert names == ["Mine"]

    def test_cannot_read_another_users_project(self, auth_client):
        foreign = ApiProjectFactory(name="Secret")
        response = auth_client.get(f"{PROJECTS_URL}{foreign.id}/")
        assert response.status_code == 404

    def test_cannot_update_another_users_project(self, auth_client):
        foreign = ApiProjectFactory(name="Secret")
        response = auth_client.patch(
            f"{PROJECTS_URL}{foreign.id}/", {"name": "Hacked"}, format="json"
        )
        assert response.status_code == 404
        foreign.refresh_from_db()
        assert foreign.name == "Secret"

    def test_delete_removes_project(self, auth_client, project):
        response = auth_client.delete(f"{PROJECTS_URL}{project.id}/")
        assert response.status_code == 204
        assert not ApiProject.objects.filter(id=project.id).exists()

    def test_tag_filter(self, auth_client, user):
        ApiProjectFactory(owner=user, name="Tagged", tags=["payments", "core"])
        ApiProjectFactory(owner=user, name="Untagged", tags=["misc"])

        response = auth_client.get(f"{PROJECTS_URL}?tag=payments")

        assert [item["name"] for item in response.json()["results"]] == ["Tagged"]

    def test_search_filter(self, auth_client, user):
        ApiProjectFactory(owner=user, name="Stripe Gateway")
        ApiProjectFactory(owner=user, name="Internal Tool")

        response = auth_client.get(f"{PROJECTS_URL}?search=stripe")

        assert [item["name"] for item in response.json()["results"]] == ["Stripe Gateway"]

    def test_endpoints_count_annotation(self, auth_client, project):
        EndpointFactory.create_batch(3, project=project)
        response = auth_client.get(PROJECTS_URL)
        assert response.json()["results"][0]["endpoints_count"] == 3

    def test_requires_authentication(self, api_client):
        assert api_client.get(PROJECTS_URL).status_code == 401


class TestEndpoints:
    def test_create_mock_endpoint(self, auth_client, project):
        response = auth_client.post(
            ENDPOINTS_URL,
            {
                "project": str(project.id),
                "name": "List payments",
                "method": "GET",
                "path": "/payments",
                "mock_enabled": True,
                "mock_status": 200,
                "mock_body": {"ok": True},
            },
            format="json",
        )

        assert response.status_code == 201
        body = response.json()
        assert body["gateway_url"].endswith(f"/gateway/{project.slug}/payments")

    def test_path_must_start_with_slash(self, auth_client, project):
        response = auth_client.post(
            ENDPOINTS_URL,
            {
                "project": str(project.id),
                "name": "Bad",
                "method": "GET",
                "path": "payments",
                "mock_enabled": True,
            },
            format="json",
        )
        assert response.status_code == 400

    def test_requires_mock_or_upstream(self, auth_client, project):
        response = auth_client.post(
            ENDPOINTS_URL,
            {
                "project": str(project.id),
                "name": "Broken",
                "method": "GET",
                "path": "/broken",
            },
            format="json",
        )
        assert response.status_code == 400
        assert "target_url" in response.json()["error"]["details"]

    def test_cannot_attach_to_foreign_project(self, auth_client):
        foreign = ApiProjectFactory()
        response = auth_client.post(
            ENDPOINTS_URL,
            {
                "project": str(foreign.id),
                "name": "Injected",
                "method": "GET",
                "path": "/injected",
                "mock_enabled": True,
            },
            format="json",
        )
        assert response.status_code == 400
        assert not Endpoint.objects.filter(path="/injected").exists()

    def test_duplicate_method_path_conflicts(self, auth_client, project, endpoint):
        response = auth_client.post(
            ENDPOINTS_URL,
            {
                "project": str(project.id),
                "name": "Duplicate",
                "method": "GET",
                "path": "/payments",
                "mock_enabled": True,
            },
            format="json",
        )
        assert response.status_code == 400

    def test_filter_by_project_and_method(self, auth_client, project):
        EndpointFactory.create_batch(2, project=project, method="GET")
        EndpointFactory(project=project, method="POST", path="/payments")
        other = ApiProjectFactory(owner=project.owner)
        EndpointFactory(project=other, path="/elsewhere")

        response = auth_client.get(f"{ENDPOINTS_URL}?project={project.id}&method=GET")

        paths = [item["path"] for item in response.json()["results"]]
        assert "/elsewhere" not in paths
        assert len(paths) == 2

    def test_list_is_owner_scoped(self, auth_client, user):
        EndpointFactory(project=ApiProjectFactory())  # someone else
        mine = ApiProjectFactory(owner=user)
        EndpointFactory(project=mine, path="/mine")

        response = auth_client.get(ENDPOINTS_URL)

        assert [item["path"] for item in response.json()["results"]] == ["/mine"]

    def test_patch_toggles_active(self, auth_client, endpoint):
        response = auth_client.patch(
            f"{ENDPOINTS_URL}{endpoint.id}/", {"is_active": False}, format="json"
        )
        assert response.status_code == 200
        endpoint.refresh_from_db()
        assert endpoint.is_active is False
