"""API keys: one-time secret issuance, hashing, scoping, revoke & rotate."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.keys.models import APIKey

from .factories import ApiProjectFactory, UserFactory

pytestmark = pytest.mark.django_db

KEYS_URL = "/api/keys/"


class TestCreate:
    def test_returns_plaintext_once(self, auth_client, user):
        response = auth_client.post(KEYS_URL, {"name": "Staging", "rate_limit": 120}, format="json")

        assert response.status_code == 201
        body = response.json()
        assert body["api_key"].startswith("af_live_")
        assert body["prefix"] == body["api_key"][:12]
        assert body["status"] == "active"

    def test_secret_is_never_persisted(self, auth_client):
        body = auth_client.post(KEYS_URL, {"name": "Staging"}, format="json").json()
        plaintext = body["api_key"]

        stored = APIKey.objects.get()
        assert plaintext not in stored.key_hash
        assert stored.verify(plaintext) is True
        assert not APIKey.objects.filter(key_hash=plaintext).exists()

    def test_list_never_exposes_secret(self, auth_client, user, api_key):
        response = auth_client.get(KEYS_URL)

        assert response.status_code == 200
        item = response.json()["results"][0]
        assert "api_key" not in item
        assert item["masked_key"].startswith(item["prefix"])
        assert "•" in item["masked_key"]

    def test_rejects_invalid_scope(self, auth_client):
        response = auth_client.post(
            KEYS_URL, {"name": "Bad", "scopes": ["superuser"]}, format="json"
        )
        assert response.status_code == 400

    def test_rejects_absurd_rate_limit(self, auth_client):
        response = auth_client.post(KEYS_URL, {"name": "Bad", "rate_limit": 0}, format="json")
        assert response.status_code == 400

    def test_cannot_bind_to_foreign_project(self, auth_client):
        foreign = ApiProjectFactory()
        response = auth_client.post(
            KEYS_URL, {"name": "x", "project": str(foreign.id)}, format="json"
        )
        assert response.status_code == 400
        assert not APIKey.objects.exists()


class TestIsolation:
    def test_only_own_keys_are_listed(self, auth_client, api_key):
        key, _ = api_key
        other, _ = APIKey.generate(user=UserFactory(), name="Theirs")
        other.save()

        names = [item["name"] for item in auth_client.get(KEYS_URL).json()["results"]]

        assert names == [key.name]

    def test_cannot_revoke_another_users_key(self, auth_client):
        foreign, _ = APIKey.generate(user=UserFactory(), name="Theirs")
        foreign.save()

        response = auth_client.post(f"{KEYS_URL}{foreign.id}/revoke/")

        assert response.status_code == 404
        foreign.refresh_from_db()
        assert foreign.is_active is True


class TestLifecycle:
    def test_revoke_deactivates(self, auth_client, api_key):
        key, _ = api_key
        response = auth_client.post(f"{KEYS_URL}{key.id}/revoke/")

        assert response.status_code == 200
        assert response.json()["status"] == "revoked"
        key.refresh_from_db()
        assert key.is_active is False

    def test_rotate_issues_new_secret_and_revokes_old(self, auth_client, api_key):
        key, old_plaintext = api_key
        response = auth_client.post(f"{KEYS_URL}{key.id}/rotate/")

        assert response.status_code == 201
        body = response.json()
        assert body["api_key"] != old_plaintext
        assert body["id"] != str(key.id)

        key.refresh_from_db()
        assert key.is_active is False
        assert APIKey.objects.get(id=body["id"]).verify(body["api_key"]) is True

    def test_expired_key_reports_status(self, auth_client, user):
        expired, _ = APIKey.generate(
            user=user,
            name="Old",
            expires_at=timezone.now() - timedelta(days=1),
        )
        expired.save()

        response = auth_client.get(f"{KEYS_URL}{expired.id}/")

        assert response.json()["status"] == "expired"

    def test_stats_endpoint(self, auth_client, api_key):
        key, _ = api_key
        revoked, _ = APIKey.generate(user=key.user, name="Revoked")
        revoked.save()
        revoked.is_active = False
        revoked.save()

        response = auth_client.get(f"{KEYS_URL}stats/")

        assert response.status_code == 200
        assert response.json() == {
            "total": 2,
            "active": 1,
            "expired": 0,
            "revoked": 1,
            "total_requests": 0,
        }

    def test_delete_removes_key(self, auth_client, api_key):
        key, _ = api_key
        assert auth_client.delete(f"{KEYS_URL}{key.id}/").status_code == 204
        assert not APIKey.objects.filter(id=key.id).exists()
