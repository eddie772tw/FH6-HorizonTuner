import pytest
import asyncio
from unittest.mock import AsyncMock
from backend.core.state import ConnectionManager

@pytest.fixture
def manager():
    return ConnectionManager()

@pytest.mark.asyncio
async def test_connect_json(manager):
    ws = AsyncMock()
    await manager.connect(ws, is_binary=False)
    ws.accept.assert_awaited_once()
    assert len(manager.active_connections) == 1
    assert len(manager.active_binary_connections) == 0
    assert ws in manager.active_connections

@pytest.mark.asyncio
async def test_connect_binary(manager):
    ws = AsyncMock()
    await manager.connect(ws, is_binary=True)
    ws.accept.assert_awaited_once()
    assert len(manager.active_binary_connections) == 1
    assert len(manager.active_connections) == 0
    assert ws in manager.active_binary_connections

def test_disconnect(manager):
    ws = AsyncMock()
    manager.active_connections.append(ws)
    manager.disconnect(ws, is_binary=False)
    assert len(manager.active_connections) == 0

def test_disconnect_binary(manager):
    ws = AsyncMock()
    manager.active_binary_connections.append(ws)
    manager.disconnect(ws, is_binary=True)
    assert len(manager.active_binary_connections) == 0

@pytest.mark.asyncio
async def test_broadcast_json(manager):
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    manager.active_connections.extend([ws1, ws2])
    
    await manager.broadcast_json({"test": "data"})
    ws1.send_json.assert_awaited_once_with({"test": "data"})
    ws2.send_json.assert_awaited_once_with({"test": "data"})

@pytest.mark.asyncio
async def test_broadcast_binary(manager):
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    manager.active_binary_connections.extend([ws1, ws2])
    
    await manager.broadcast_binary(b"binary_data")
    ws1.send_bytes.assert_awaited_once_with(b"binary_data")
    ws2.send_bytes.assert_awaited_once_with(b"binary_data")

@pytest.mark.asyncio
async def test_broadcast_disconnect_on_error(manager):
    ws_good = AsyncMock()
    ws_bad = AsyncMock()
    ws_bad.send_json.side_effect = Exception("Connection lost")
    manager.active_connections.extend([ws_good, ws_bad])
    
    await manager.broadcast_json({"test": "data"})
    
    ws_good.send_json.assert_awaited_once()
    ws_bad.send_json.assert_awaited_once()
    
    # Bad connection should be removed
    assert len(manager.active_connections) == 1
    assert ws_good in manager.active_connections
    assert ws_bad not in manager.active_connections

@pytest.mark.asyncio
async def test_broadcast_binary_disconnect_on_error(manager):
    ws_good = AsyncMock()
    ws_bad = AsyncMock()
    ws_bad.send_bytes.side_effect = Exception("Connection lost")
    manager.active_binary_connections.extend([ws_good, ws_bad])
    
    await manager.broadcast_binary(b"binary_data")
    
    ws_good.send_bytes.assert_awaited_once()
    ws_bad.send_bytes.assert_awaited_once()
    
    assert len(manager.active_binary_connections) == 1
    assert ws_good in manager.active_binary_connections
    assert ws_bad not in manager.active_binary_connections
