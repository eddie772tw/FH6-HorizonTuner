import asyncio

import main


class SlowJsonSocket:
    async def send_json(self, _payload):
        await asyncio.sleep(10)


class FastJsonSocket:
    def __init__(self):
        self.payloads = []

    async def send_json(self, payload):
        self.payloads.append(payload)


def test_slow_json_client_cannot_block_other_websocket_delivery():
    async def scenario():
        manager = main.ConnectionManager()
        slow = SlowJsonSocket()
        fast = FastJsonSocket()
        manager.active_connections = [slow, fast]

        await asyncio.wait_for(manager.broadcast_json({"type": "test"}), timeout=1.2)

        assert slow not in manager.active_connections
        assert fast.payloads == [{"type": "test"}]

    asyncio.run(scenario())
