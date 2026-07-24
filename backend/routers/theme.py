from typing import Any, Dict

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/theme", tags=["Theme"])


@router.get("/config")
async def get_theme_config():
    # Will be connected to app_settings
    from backend.routers.settings import app_settings

    return app_settings.get("theme", {})


@router.post("/config")
async def update_theme_config(theme_data: Dict[str, Any]):
    from backend.routers.settings import app_settings, save_app_settings

    if "theme" not in app_settings:
        app_settings["theme"] = {}
    app_settings["theme"].update(theme_data)
    save_app_settings()
    return {"status": "success", "theme": app_settings["theme"]}
