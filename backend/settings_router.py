"""HTTP boundary for settings persistence and its safe storage overview."""

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter


def create_settings_router(
    get_settings: Callable[[], dict[str, Any]],
    update_settings: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
    get_storage_overview: Callable[[], dict[str, Any]],
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/settings")
    async def read_settings() -> dict[str, Any]:
        return get_settings()

    @router.post("/api/settings")
    async def write_settings(data: dict[str, Any]) -> dict[str, Any]:
        return await update_settings(data)

    @router.get("/api/settings/storage-overview")
    async def storage_overview() -> dict[str, Any]:
        return get_storage_overview()

    return router
