"""WebSocket consumer for the live request-log stream."""

from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class LogConsumer(AsyncJsonWebsocketConsumer):
    """Pushes ``log.created`` events to the authenticated user's group."""

    async def connect(self) -> None:
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group_name = f"logs_user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code: int) -> None:
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def log_event(self, event: dict) -> None:
        await self.send_json({"type": "log.created", "data": event["payload"]})

    async def ping(self, event: dict) -> None:
        """Keep-alive so proxies do not drop an idle dashboard."""
        await self.send_json({"type": "pong", "data": {}})
