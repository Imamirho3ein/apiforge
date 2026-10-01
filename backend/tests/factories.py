"""Model factories (factory_boy) used across the suite."""

from __future__ import annotations

from datetime import timedelta

import factory
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.analytics.models import RequestLog
from apps.apis.models import ApiProject, Endpoint
from apps.keys.models import APIKey

User = get_user_model()


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.Sequence(lambda n: f"user{n}")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    password = factory.PostGenerationMethodCall("set_password", "TestPass!234")

    @classmethod
    def _after_postgeneration(cls, instance, create, results=None):
        if create and results:
            instance.save()


class ApiProjectFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApiProject

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Project {n}")
    description = factory.Faker("sentence")
    base_path = "/v1"
    tags = factory.List(["demo"])


class EndpointFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Endpoint

    project = factory.SubFactory(ApiProjectFactory)
    name = factory.Sequence(lambda n: f"Endpoint {n}")
    method = Endpoint.Method.GET
    path = factory.Sequence(lambda n: f"/resource-{n}")
    mock_enabled = True
    mock_status = 200
    mock_body = factory.Dict({"ok": True})


class APIKeyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = APIKey

    user = factory.SubFactory(UserFactory)
    project = factory.SubFactory(ApiProjectFactory)
    name = factory.Sequence(lambda n: f"Key {n}")
    rate_limit = 1000
    scopes = factory.List(["read"])

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """Generate a real secret instead of using the default create()."""
        instance, plaintext = APIKey.generate(
            user=kwargs.pop("user"),
            name=kwargs.pop("name", "key"),
            project=kwargs.pop("project", None),
            scopes=kwargs.pop("scopes", ["read"]),
            rate_limit=kwargs.pop("rate_limit", 1000),
            expires_at=kwargs.pop("expires_at", None),
        )
        instance.save()
        instance._plaintext = plaintext
        return instance


class RequestLogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = RequestLog

    project = factory.SubFactory(ApiProjectFactory)
    method = "GET"
    path = "/things"
    status_code = 200
    latency_ms = factory.Faker("pyfloat", left_digits=2, right_digits=2, positive=True)
    created_at = factory.LazyFunction(lambda: timezone.now() - timedelta(minutes=5))

    @factory.lazy_attribute
    def owner(self) -> int:
        return self.project.owner_id

    @factory.lazy_attribute
    def project_name(self) -> str:  # pragma: no cover - unused
        return self.project.name
