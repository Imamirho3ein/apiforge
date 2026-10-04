"""Seed a realistic demo dataset.

    python manage.py seed_demo                # idempotent, ~7 days of traffic
    python manage.py seed_demo --reset --logs-per-day 400

Creates a demo account with three API projects, mock endpoints, issued API
keys and a believable request history so the dashboard has something to
show the moment you start the server.
"""

from __future__ import annotations

import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.analytics.models import RequestLog
from apps.apis.models import ApiProject, Endpoint
from apps.keys.models import APIKey

User = get_user_model()

DEMO_EMAIL = "demo@apiforge.dev"
DEMO_PASSWORD = "DemoPass!234"

PROJECTS = [
    {
        "name": "Payments API",
        "description": "Checkout, refunds and invoice rendering.",
        "tags": ["payments", "billing"],
        "endpoints": [
            ("List charges", "GET", "/charges", 200, {"data": [], "has_more": False}),
            (
                "Create charge",
                "POST",
                "/charges",
                201,
                {"id": "ch_123", "amount": 4200, "currency": "usd"},
            ),
            ("Get charge", "GET", "/charges/{id}", 200, {"id": "ch_123", "status": "succeeded"}),
            (
                "Refund charge",
                "POST",
                "/charges/{id}/refund",
                200,
                {"id": "re_9", "status": "pending"},
            ),
            ("Webhook test", "POST", "/webhooks/stripe", 202, {"received": True}),
        ],
    },
    {
        "name": "Users Service",
        "description": "Internal identity and profile service.",
        "tags": ["internal", "core"],
        "endpoints": [
            ("List users", "GET", "/users", 200, {"data": [], "total": 0}),
            ("Get user", "GET", "/users/{id}", 200, {"id": "usr_1", "email": "jane@example.com"}),
            ("Create user", "POST", "/users", 201, {"id": "usr_2"}),
            ("Delete user", "DELETE", "/users/{id}", 204, None),
        ],
    },
    {
        "name": "Public Blog API",
        "description": "Read-only content API for the marketing site.",
        "tags": ["public", "read-only"],
        "endpoints": [
            ("List posts", "GET", "/posts", 200, {"data": []}),
            ("Get post", "GET", "/posts/{slug}", 200, {"slug": "hello-world", "title": "Hello"}),
            ("List tags", "GET", "/tags", 200, {"data": ["django", "react"]}),
        ],
    },
]

USER_AGENTS = [
    "curl/8.4.0",
    "python-httpx/0.28.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "PostmanRuntime/7.37.0",
    "node-fetch/3.3.2",
]

# Rough outcome mix: mostly success, some client errors, a few server errors.
ERROR_STATUSES = [400, 401, 404, 422, 429, 500, 502, 503]
ERROR_RATE = 0.18


class Command(BaseCommand):
    help = "Populate the database with demo projects, keys and request logs."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email", default=DEMO_EMAIL)
        parser.add_argument("--logs-per-day", type=int, default=180)
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        random.seed(1337)  # reproducible demo data
        days = options["days"]
        logs_per_day = options["logs_per_day"]

        if options["reset"]:
            self.stdout.write("Resetting demo data…")
            RequestLog.objects.all().delete()
            ApiProject.objects.filter(owner__email=options["email"]).delete()
            APIKey.objects.filter(user__email=options["email"]).delete()
            User.objects.filter(email=options["email"]).delete()

        user, created = User.objects.get_or_create(
            email=options["email"],
            defaults={
                "username": "demo",
                "first_name": "Demo",
                "last_name": "User",
                "company": "APIForge",
                "bio": "Demo account seeded by `manage.py seed_demo`.",
            },
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        self.stdout.write(f"User: {user.email} ({'created' if created else 'exists'})")

        projects, endpoints = [], []
        for spec in PROJECTS:
            project_defaults = {key: value for key, value in spec.items() if key != "endpoints"}
            project, _ = ApiProject.objects.get_or_create(
                owner=user, name=spec["name"], defaults=project_defaults
            )
            projects.append(project)
            for name, method, path, status, body in spec["endpoints"]:
                endpoint, _ = Endpoint.objects.get_or_create(
                    project=project,
                    method=method,
                    path=path,
                    defaults={
                        "name": name,
                        "mock_enabled": True,
                        "mock_status": status,
                        "mock_body": body if body is not None else {},
                    },
                )
                endpoints.append(endpoint)
        self.stdout.write(f"Projects: {len(projects)}, endpoints: {len(endpoints)}")

        # Idempotency matters: free PaaS tiers (Render, Fly) run the entrypoint
        # on every cold start with an ephemeral disk. Issuing fresh keys and
        # re-inserting a week of logs each boot would grow without bound.
        existing_keys = list(APIKey.objects.filter(user=user).order_by("created_at"))
        if existing_keys:
            keys = [(key, None) for key in existing_keys]
            self.stdout.write(
                f"API keys: reusing {len(keys)} existing key(s) -> no new secrets issued."
            )
        else:
            keys = []
            for name, project, rate_limit, scopes in [
                ("Production key", projects[0], 600, ["read", "write"]),
                ("Staging key", projects[0], 60, ["read"]),
                ("Read-only key", projects[1], 120, ["read"]),
                ("Global key", None, 300, ["read", "write", "admin"]),
            ]:
                key, plaintext = APIKey.generate(
                    user=user,
                    name=name,
                    project=project,
                    rate_limit=rate_limit,
                    scopes=scopes,
                )
                key.save()
                keys.append((key, plaintext))
            self.stdout.write(self.style.SUCCESS("Issued API keys (shown once):"))
            for key, plaintext in keys:
                self.stdout.write(f"  {key.name:<16} {plaintext}")

        if RequestLog.objects.filter(owner=user).exists():
            total = RequestLog.objects.count()
            self.stdout.write(f"Request logs: {total} already present -> skipping generation.")
            self.stdout.write(f"\nLog in at /login with {user.email} / {DEMO_PASSWORD}")
            return

        now = timezone.now()
        rows = []
        for day_offset in range(days):
            day_start = now - timedelta(days=day_offset)
            for _ in range(logs_per_day):
                endpoint = random.choice(endpoints)
                # Only use keys that are actually valid for this project.
                eligible = [key for key, _ in keys if key.project_id in (None, endpoint.project_id)]
                key = random.choice(eligible or [keys[0][0]])

                if random.random() < ERROR_RATE:
                    status = random.choice(ERROR_STATUSES)
                    latency = round(random.uniform(25, 240), 2)
                else:
                    status = endpoint.mock_status or 200
                    latency = round(random.uniform(4, 120), 2)

                created_at = day_start - timedelta(
                    hours=random.uniform(0, 23.99), minutes=random.uniform(0, 59)
                )
                rows.append(
                    RequestLog(
                        owner=user,
                        project=endpoint.project,
                        endpoint=endpoint,
                        api_key=key,
                        key_name=key.name,
                        endpoint_name=endpoint.name,
                        method=endpoint.method,
                        path=endpoint.path,
                        status_code=status,
                        latency_ms=latency,
                        ip_address=f"203.0.113.{random.randint(2, 254)}",
                        user_agent=random.choice(USER_AGENTS),
                        created_at=created_at,
                    )
                )

        RequestLog.objects.bulk_create(rows, batch_size=500)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(rows)} request logs across {days} day(s). "
                f"Total logs in DB: {RequestLog.objects.count()}"
            )
        )
        self.stdout.write(
            f"\nLog in at http://localhost:5173/login with {user.email} / {DEMO_PASSWORD}"
        )
