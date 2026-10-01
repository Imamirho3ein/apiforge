"""Fixed-window rate limiting backed by the Django cache.

In production ``CACHES`` points at Redis, so counters are shared across all
gunicorn/daphne workers. Locally it falls back to a per-process LocMem cache.
"""

from __future__ import annotations

import time

from django.core.cache import cache

WINDOW_SECONDS = 60
TIMEOUT = WINDOW_SECONDS * 2  # survive the boundary long enough to finish the window


def consume(key: str, limit: int) -> tuple[bool, int, int]:
    """Consume one unit of quota.

    Returns ``(allowed, used, retry_after_seconds)`` where ``retry_after`` is
    the number of seconds until the current window resets.
    """
    now = int(time.time())
    window = now // WINDOW_SECONDS
    cache_key = f"apiforge:rl:{key}:{window}"

    if not cache.add(cache_key, 1, timeout=TIMEOUT):
        try:
            used = cache.incr(cache_key)
        except ValueError:  # window expired between add() and incr()
            cache.set(cache_key, 1, timeout=TIMEOUT)
            used = 1
    else:
        used = 1

    retry_after = (window + 1) * WINDOW_SECONDS - now
    return used <= limit, used, retry_after


def reset(key: str) -> None:
    """Test helper — clears the counter for a key in the current window."""
    cache.delete(f"apiforge:rl:{key}:{int(time.time()) // WINDOW_SECONDS}")
