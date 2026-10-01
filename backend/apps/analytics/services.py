"""Aggregation services — all queries are portable across SQLite/Postgres.

Every function is hard-scoped to ``owner``: a user can only ever aggregate
their own traffic, whatever project id they pass in.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDay, TruncHour
from django.utils import timezone

from .models import RequestLog

INTERVALS = {"hour": TruncHour, "day": TruncDay}


def _base_queryset(owner: AbstractBaseUser, project_id: str | None, days: int):
    qs = RequestLog.objects.filter(owner=owner)
    if project_id:
        qs = qs.filter(project_id=project_id, project__owner=owner)
    if days and days > 0:
        since = timezone.now() - timedelta(days=days)
        qs = qs.filter(created_at__gte=since)
    return qs


def summary(owner, project_id: str | None = None, days: int = 7) -> dict:
    qs = _base_queryset(owner, project_id, days)
    aggregates = qs.aggregate(
        total=Count("id"),
        errors=Count("id", filter=Q(status_code__gte=400)),
        avg_latency=Avg("latency_ms"),
    )
    total = aggregates["total"] or 0
    errors = aggregates["errors"] or 0
    success_rate = round((total - errors) / total * 100, 2) if total else 100.0
    return {
        "total_requests": total,
        "success_rate": success_rate,
        "error_count": errors,
        "avg_latency_ms": round(aggregates["avg_latency"] or 0, 2),
        "unique_keys": qs.exclude(api_key__isnull=True).values("api_key").distinct().count(),
        "projects": qs.exclude(project__isnull=True).values("project").distinct().count(),
        "period": {
            "days": days,
            "since": (timezone.now() - timedelta(days=days)).isoformat(),
        },
    }


def timeseries(
    owner, project_id: str | None = None, days: int = 7, interval: str = "hour"
) -> list[dict]:
    trunc = INTERVALS.get(interval, TruncHour)
    qs = (
        _base_queryset(owner, project_id, days)
        .annotate(bucket=trunc("created_at"))
        .values("bucket")
        .annotate(
            total=Count("id"),
            errors=Count("id", filter=Q(status_code__gte=400)),
        )
        .order_by("bucket")
    )
    return [
        {
            "bucket": row["bucket"].isoformat() if row["bucket"] else None,
            "total": row["total"],
            "errors": row["errors"],
        }
        for row in qs
    ]


def status_distribution(owner, project_id: str | None = None, days: int = 7) -> dict:
    qs = _base_queryset(owner, project_id, days)
    by_code = {
        row["status_code"]: row["count"]
        for row in qs.values("status_code").annotate(count=Count("id")).order_by("status_code")
    }
    buckets = {"2xx": 0, "4xx": 0, "5xx": 0}
    for status, count in by_code.items():
        if 200 <= status < 300:
            buckets["2xx"] += count
        elif 400 <= status < 500:
            buckets["4xx"] += count
        elif 500 <= status < 600:
            buckets["5xx"] += count
    return {
        "by_class": [{"bucket": key, "count": value} for key, value in buckets.items()],
        "by_code": [{"status": status, "count": count} for status, count in by_code.items()],
    }


def top_endpoints(
    owner, project_id: str | None = None, days: int = 7, limit: int = 5
) -> list[dict]:
    qs = (
        _base_queryset(owner, project_id, days)
        .exclude(endpoint__isnull=True)
        .values("endpoint__method", "endpoint__path")
        .annotate(count=Count("id"), avg_latency=Avg("latency_ms"))
        .order_by("-count")[:limit]
    )
    return [
        {
            "method": row["endpoint__method"],
            "path": row["endpoint__path"],
            "count": row["count"],
            "avg_latency_ms": round(row["avg_latency"] or 0, 2),
        }
        for row in qs
    ]
