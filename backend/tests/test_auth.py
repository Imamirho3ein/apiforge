"""Auth: registration, JWT issue/refresh/verify, profile, error envelope."""

from __future__ import annotations

import pytest

from apps.accounts.models import User

pytestmark = pytest.mark.django_db


REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/token/"
REFRESH_URL = "/api/auth/token/refresh/"
VERIFY_URL = "/api/auth/token/verify/"
ME_URL = "/api/auth/me/"


def payload(**overrides) -> dict:
    data = {
        "email": "jane@example.com",
        "username": "jane",
        "password": "Sup3rSecret!",
        "first_name": "Jane",
    }
    data.update(overrides)
    return data


class TestRegister:
    def test_creates_user_and_returns_token_pair(self, api_client):
        response = api_client.post(REGISTER_URL, payload(), format="json")

        assert response.status_code == 201
        body = response.json()
        assert body["access"] and body["refresh"]
        assert body["user"]["email"] == "jane@example.com"
        assert "password" not in body["user"]
        assert User.objects.filter(email="jane@example.com").exists()

    def test_password_is_hashed(self, api_client):
        api_client.post(REGISTER_URL, payload(), format="json")
        user = User.objects.get(email="jane@example.com")
        assert user.password != "Sup3rSecret!"
        assert user.check_password("Sup3rSecret!")

    def test_rejects_duplicate_email(self, api_client):
        api_client.post(REGISTER_URL, payload(), format="json")
        response = api_client.post(REGISTER_URL, payload(username="other"), format="json")

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "validation_error"
        assert "email" in response.json()["error"]["details"]

    def test_rejects_weak_password(self, api_client):
        response = api_client.post(REGISTER_URL, payload(password="12345678"), format="json")
        assert response.status_code == 400

    def test_requires_email_and_password(self, api_client):
        response = api_client.post(REGISTER_URL, {}, format="json")
        assert response.status_code == 400
        details = response.json()["error"]["details"]
        assert {"email", "username", "password"} <= set(details)


class TestLogin:
    def test_returns_tokens_and_user(self, api_client, user):
        response = api_client.post(
            LOGIN_URL, {"email": user.email, "password": "TestPass!234"}, format="json"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access"] and body["refresh"]
        assert body["user"]["email"] == user.email

    def test_wrong_password_is_401(self, api_client, user):
        response = api_client.post(
            LOGIN_URL, {"email": user.email, "password": "nope"}, format="json"
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "not_authenticated"

    def test_unknown_email_is_401(self, api_client, db):
        response = api_client.post(
            LOGIN_URL, {"email": "ghost@example.com", "password": "x"}, format="json"
        )
        assert response.status_code == 401


class TestRefreshAndVerify:
    def test_refresh_rotates_both_tokens(self, api_client, user):
        login = api_client.post(
            LOGIN_URL, {"email": user.email, "password": "TestPass!234"}, format="json"
        ).json()

        response = api_client.post(REFRESH_URL, {"refresh": login["refresh"]}, format="json")

        assert response.status_code == 200
        body = response.json()
        assert body["access"] != login["access"]
        # ROTATE_REFRESH_TOKENS is enabled in settings.
        assert body["refresh"] != login["refresh"]

    def test_refresh_rejects_garbage(self, api_client, db):
        response = api_client.post(REFRESH_URL, {"refresh": "nope"}, format="json")
        assert response.status_code == 401

    def test_verify_accepts_valid_token(self, api_client, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        token = str(RefreshToken.for_user(user).access_token)
        response = api_client.post(VERIFY_URL, {"token": token}, format="json")
        assert response.status_code == 204

    def test_verify_rejects_invalid_token(self, api_client, db):
        response = api_client.post(VERIFY_URL, {"token": "abc.def.ghi"}, format="json")
        assert response.status_code == 401


class TestMe:
    def test_requires_authentication(self, api_client):
        response = api_client.get(ME_URL)
        assert response.status_code == 401

    def test_returns_current_user(self, auth_client, user):
        response = auth_client.get(ME_URL)
        assert response.status_code == 200
        assert response.json()["email"] == user.email

    def test_patch_updates_profile(self, auth_client, user):
        response = auth_client.patch(
            ME_URL, {"company": "ACME", "bio": "Backend engineer"}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["company"] == "ACME"
        user.refresh_from_db()
        assert user.bio == "Backend engineer"

    def test_cannot_change_email_through_patch(self, auth_client, user):
        original = user.email
        auth_client.patch(ME_URL, {"email": "hacked@example.com"}, format="json")
        user.refresh_from_db()
        assert user.email == original
