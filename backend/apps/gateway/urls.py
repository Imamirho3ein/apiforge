from django.urls import path

from .views import proxy

app_name = "gateway"

urlpatterns = [
    path("<slug:slug>/<path:subpath>", proxy, name="proxy"),
    path("<slug:slug>", proxy, name="proxy-root"),
]
