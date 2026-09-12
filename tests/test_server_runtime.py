"""HTTP startup contracts without launching the application or host devices."""

import socket
from unittest.mock import Mock

import pytest
import uvicorn

from backend.server_runtime import ReadyServer, bind_http_socket


def test_dev_conflict_preserves_the_existing_listener():
    with bind_http_socket(0, allow_fallback=False) as occupied:
        occupied.listen()
        port = occupied.getsockname()[1]
        with pytest.raises(OSError):
            bind_http_socket(port, allow_fallback=False)
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            pass


def test_release_fallback_keeps_ownership_of_the_selected_port():
    with bind_http_socket(0, allow_fallback=False) as occupied:
        occupied.listen()
        port = occupied.getsockname()[1]
        with bind_http_socket(port, allow_fallback=True) as fallback:
            fallback.listen()
            selected = fallback.getsockname()[1]
            assert selected != port
            with pytest.raises(OSError):
                bind_http_socket(selected, allow_fallback=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("succeeds", [False, True])
async def test_readiness_requires_successful_lifespan(succeeds):
    async def app(scope, receive, send):
        assert scope["type"] == "lifespan"
        assert (await receive())["type"] == "lifespan.startup"
        await send(
            {
                "type": "lifespan.startup.complete"
                if succeeds
                else "lifespan.startup.failed"
            }
        )
        if succeeds:
            assert (await receive())["type"] == "lifespan.shutdown"
            await send({"type": "lifespan.shutdown.complete"})

    ready = Mock()
    config = uvicorn.Config(app, lifespan="on")
    config.load()
    server = ReadyServer(config, ready)
    server.lifespan = config.lifespan_class(config)
    with bind_http_socket(0, allow_fallback=False) as listener:
        await server.startup(sockets=[listener])
        assert server.started is succeeds
        assert ready.called is succeeds
        assert server.should_exit is (not succeeds)
        if succeeds:
            await server.shutdown(sockets=[listener])
