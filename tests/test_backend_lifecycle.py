import asyncio
import socket

import main
import pytest


def get_free_udp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def bind_udp_port(port: int) -> socket.socket:
    blocker = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    blocker.bind(("127.0.0.1", port))
    return blocker


@pytest.mark.asyncio
async def test_lifespan_releases_udp_listener(monkeypatch):
    port = get_free_udp_port()
    monkeypatch.setenv("TELEMETRY_IP", "127.0.0.1")
    monkeypatch.setenv("TELEMETRY_PORT", str(port))

    async with main.lifespan(main.app):
        with pytest.raises(OSError):
            bind_udp_port(port)

    released_probe = bind_udp_port(port)
    released_probe.close()


@pytest.mark.asyncio
async def test_lifespan_fails_when_udp_port_is_occupied(monkeypatch):
    port = get_free_udp_port()
    blocker = bind_udp_port(port)
    monkeypatch.setenv("TELEMETRY_IP", "127.0.0.1")
    monkeypatch.setenv("TELEMETRY_PORT", str(port))

    try:
        with pytest.raises(OSError):
            async with main.lifespan(main.app):
                pytest.fail("lifespan must not yield when UDP binding fails")
    finally:
        blocker.close()


@pytest.mark.asyncio
async def test_lifespan_cancels_background_tasks(monkeypatch):
    port = get_free_udp_port()
    monkeypatch.setenv("TELEMETRY_IP", "127.0.0.1")
    monkeypatch.setenv("TELEMETRY_PORT", str(port))

    async with main.lifespan(main.app):
        await asyncio.sleep(0)

    await asyncio.sleep(0)
    current_tasks = asyncio.all_tasks()
    assert all(
        task.get_coro().__name__
        not in {
            "broadcast_telemetry",
            "broadcast_overlay_state",
            "_run",
        }
        for task in current_tasks
        if task is not asyncio.current_task()
    )
