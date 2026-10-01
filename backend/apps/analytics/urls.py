from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    RequestLogViewSet,
    StatusDistributionView,
    SummaryView,
    TimeseriesView,
    TopEndpointsView,
)

app_name = "analytics"

router = DefaultRouter()
router.register("logs", RequestLogViewSet, basename="logs")

urlpatterns = [
    path("analytics/summary/", SummaryView.as_view(), name="summary"),
    path("analytics/timeseries/", TimeseriesView.as_view(), name="timeseries"),
    path(
        "analytics/status-distribution/",
        StatusDistributionView.as_view(),
        name="status-distribution",
    ),
    path("analytics/top-endpoints/", TopEndpointsView.as_view(), name="top-endpoints"),
    path("", include(router.urls)),
]
