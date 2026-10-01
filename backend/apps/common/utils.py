"""Misc helpers shared by several apps."""

from __future__ import annotations

import ipaddress
import uuid
from urllib.parse import urlparse

from django.utils.text import slugify


def short_id(length: int = 6) -> str:
    return uuid.uuid4().hex[:length]


def unique_slug(instance, value: str, slug_field: str = "slug") -> str:
    """Slugify ``value`` and append a short suffix until it is unique."""
    base = slugify(value)[:100] or "item"
    slug = base
    model = type(instance)
    suffix = 1
    while (
        model._default_manager.filter(**{slug_field: slug})
        .exclude(pk=getattr(instance, "pk", None))
        .exists()
    ):
        suffix += 1
        slug = f"{base}-{short_id()}" if suffix == 2 else f"{base}-{suffix}"
    return slug


def client_ip(request) -> str | None:
    """Best-effort client IP (handles a single trusted proxy hop)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
    else:
        candidate = request.META.get("REMOTE_ADDR", "")
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def is_private_upstream(url: str) -> bool:
    """True when the upstream target is loopback/private (SSRF guard)."""
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return True
    if host in {"localhost", "*.localhost"}:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        # Hostname (not an IP literal) — resolve is done by the HTTP client.
        # We conservatively treat unknown hostnames as public.
        return host.lower() == "localhost"
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
    )
