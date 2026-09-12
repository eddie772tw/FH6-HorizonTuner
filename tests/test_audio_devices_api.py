"""Slow host device enumeration must not block ordinary startup requests."""

import asyncio
import threading

import httpx
import main
import pytest


@pytest.mark.asyncio
async def test_audio_enumeration_does_not_block_other_http_requests(monkeypatch):
    entered = threading.Event()
    release = threading.Event()

    def enumerate_devices():
        entered.set()
        release.wait(timeout=3)
        return [{"id": "default", "name": "Default", "is_default": True}]

    monkeypatch.setattr(main, "get_available_audio_devices", enumerate_devices)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        audio = asyncio.create_task(client.get("/api/audio/devices"))
        try:
            for _ in range(100):
                if entered.is_set():
                    break
                await asyncio.sleep(0.01)
            assert entered.is_set()
            assert not release.is_set()
            config = await asyncio.wait_for(client.get("/api/overlay/config"), 1)
            assert config.status_code == 200
            assert not audio.done()
        finally:
            release.set()
            result = await audio
        assert result.status_code == 200
        assert result.json()[0]["id"] == "default"
