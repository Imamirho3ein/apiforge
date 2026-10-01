from rest_framework.routers import DefaultRouter

from .views import ApiProjectViewSet, EndpointViewSet

app_name = "apis"

router = DefaultRouter()
router.register("projects", ApiProjectViewSet, basename="projects")
router.register("endpoints", EndpointViewSet, basename="endpoints")

urlpatterns = router.urls
