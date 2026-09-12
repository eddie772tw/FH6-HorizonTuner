"""Bind once and announce readiness only after HTTP and app startup succeed."""

import asyncio
import socket
from collections.abc import Callable

import uvicorn


def bind_http_socket(port: int, *, allow_fallback: bool) -> socket.socket:
    """Keep ownership of the bound socket until Uvicorn takes it over."""
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            listener.bind(("127.0.0.1", port))
        except OSError:
            if not allow_fallback:
                raise
            listener.bind(("127.0.0.1", 0))
        return listener
    except BaseException:
        listener.close()
        raise


class ReadyServer(uvicorn.Server):
    """Publish the endpoint after lifespan and the listening socket are ready."""

    def __init__(self, config: uvicorn.Config, on_ready: Callable[[], None]):
        super().__init__(config)
        self.on_ready = on_ready

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        # This backend is one process. Uvicorn's supplied-socket worker path
        # calls platform.system(), which can block on Windows WMI even with
        # one worker. Use asyncio's single-process socket handoff directly.
        if not sockets or self.config.workers != 1:
            raise ValueError("ReadyServer requires a bound socket and one worker")
        await self.lifespan.startup()
        if self.lifespan.should_exit:
            self.should_exit = True
            return
        loop = asyncio.get_running_loop()
        self.servers = []
        for listener in sockets:
            server = await loop.create_server(
                lambda: self.config.http_protocol_class(
                    config=self.config,
                    server_state=self.server_state,
                    app_state=self.lifespan.state,
                    _loop=loop,
                ),
                sock=listener,
                backlog=self.config.backlog,
            )
            self.servers.append(server)
        self.started = True
        self.on_ready()
