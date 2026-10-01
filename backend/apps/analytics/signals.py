"""Broadcast every new request log to the owner's WebSocket group."""

from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import RequestLog
from .serializers import RequestLogSerializer


@receiver(post_save, sender=RequestLog, dispatch_uid="broadcast_request_log")
def broadcast_request_log(sender, instance: RequestLog, created: bool, **kwargs) -> None:
    if not created or not instance.owner_id:
        return

    payload = RequestLogSerializer(instance).data

    def _send() -> None:
        layer = get_channel_layer()
        if layer is None:  # pragma: no cover - defensive
            return
        async_to_sync(layer.group_send)(
            f"logs_user_{instance.owner_id}",
            {"type": "log.event", "payload": payload},
        )

    # Inside a transaction (tests, bulk creates) wait until commit so the
    # consumer never reads a row that is about to be rolled back.
    transaction.on_commit(_send)
