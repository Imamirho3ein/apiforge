"""Root URL configuration."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.common.views import health, spa

admin.site.site_header = "APIForge administration"
admin.site.site_title = "APIForge admin"
admin.site.index_title = "API management platform"

urlpatterns = [
    path("admin/", admin.site.urls),
    # OpenAPI schema & interactive documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.apis.urls")),
    path("api/", include("apps.keys.urls")),
    path("api/", include("apps.analytics.urls")),
    # Public data plane — authenticated with an API key, not a JWT.
    path("gateway/", include("apps.gateway.urls")),
]

# Single-container deployments: hand every remaining GET to the React shell.
# The negative lookahead keeps API, gateway, admin and asset paths untouched.
if getattr(settings, "SERVE_SPA", False):
    urlpatterns += [
        re_path(
            r"^(?!api/|gateway/|ws/|admin/|static/|media/|__).*$",
            spa,
            name="spa",
        )
    ]

if settings.DEBUG:  # pragma: no cover
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = "apps.common.errors.page_not_found"  # JSON 404 instead of HTML
