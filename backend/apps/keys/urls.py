from rest_framework.routers import DefaultRouter

from .views import APIKeyViewSet

app_name = "keys"

router = DefaultRouter()
router.register("keys", APIKeyViewSet, basename="keys")

urlpatterns = router.urls
