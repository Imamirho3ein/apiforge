"""Pagination classes."""

from rest_framework.pagination import CursorPagination, PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class LogCursorPagination(CursorPagination):
    """Cursor pagination for the (append-heavy) request log stream.

    O(1) pagination that stays stable while new rows arrive — no duplicate
    or skipped rows when the UI keeps loading older pages.
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = "-created_at"
