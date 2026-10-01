"""URLconf that isolates the SPA catch-all pattern.

``config.urls`` only installs the catch-all when ``SERVE_SPA`` is true at
import time, so the test points ``ROOT_URLCONF`` here instead.
"""

from django.urls import re_path

from apps.common.views import health, spa

urlpatterns = [
    re_path(r"^api/health/$", health),
    # Same pattern as config/urls.py.
    re_path(r"^(?!api/|gateway/|ws/|admin/|static/|media/|__).*$", spa),
]
