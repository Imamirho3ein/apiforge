"""Auth endpoints: register, JWT pair, token refresh/verify, current user."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import (
    TokenRefreshSerializer,
    TokenVerifySerializer,
)
from rest_framework_simplejwt.tokens import AccessToken

from .schemas import (
    AuthTokenPairSerializer,
    RefreshTokenPairSerializer,
)
from .serializers import CustomTokenObtainPairSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Create an account and return a ready-to-use JWT pair."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(
        summary="Register an account",
        request=RegisterSerializer,
        responses={201: AuthTokenPairSerializer},
        tags=["auth"],
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = CustomTokenObtainPairSerializer.get_token(user)
        return Response(
            {
                "access": str(token.access_token),
                "refresh": str(token),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """POST {email, password} -> {access, refresh, user}."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(
        summary="Obtain a JWT pair",
        request=CustomTokenObtainPairSerializer,
        responses={200: AuthTokenPairSerializer},
        tags=["auth"],
    )
    def post(self, request) -> Response:
        serializer = CustomTokenObtainPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # `validated_data` holds {access, refresh}; `user` is added by our
        # serializer's validate() override.
        return Response(serializer.validated_data)


class TokenRefreshView(APIView):
    """Refresh an access token (rotating the refresh token when enabled)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(
        summary="Refresh the access token",
        request=TokenRefreshSerializer,
        responses={200: RefreshTokenPairSerializer},
        tags=["auth"],
    )
    def post(self, request) -> Response:
        serializer = TokenRefreshSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:  # simplejwt raises bare exceptions
            raise InvalidToken(str(exc)) from exc
        return Response(serializer.validated_data)


class TokenVerifyView(APIView):
    """POST {token} -> 204 when the access token is still valid."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Verify an access token",
        request=TokenVerifySerializer,
        responses={204: None},
        tags=["auth"],
    )
    def post(self, request) -> Response:
        raw = request.data.get("token", "")
        if not raw:
            raise InvalidToken("No token provided.")
        try:
            AccessToken(raw)
        except TokenError as exc:  # invalid / expired / wrong type
            raise InvalidToken(str(exc)) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH the profile of the authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self) -> User:
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        serializer = self.get_serializer(request.user, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
