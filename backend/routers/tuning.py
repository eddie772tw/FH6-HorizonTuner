from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.services.car_service import car_service
from backend.services.tuning_service import tuning_service

router = APIRouter(prefix="/api", tags=["Tuning & Cars"])


@router.get("/tunings")
async def list_tunings():
    return tuning_service.list_tunings()


@router.post("/tunings")
async def save_tuning(payload: Dict[str, Any]):
    name = payload.get("name")
    data = payload.get("data")
    if not name or not data:
        raise HTTPException(status_code=400, detail="Missing name or data")
    filename = tuning_service.save_tuning(name, data)
    return {"status": "success", "filename": filename}


@router.delete("/tunings/{filename}")
async def delete_tuning(filename: str):
    if tuning_service.delete_tuning(filename):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Tuning file not found")


@router.get("/cars")
async def get_cars():
    return car_service.car_database


@router.get("/cars/{ordinal}")
async def get_car(ordinal: int):
    car = car_service.get_car_by_ordinal(ordinal)
    if car:
        return car
    raise HTTPException(status_code=404, detail="Car not found")


@router.get("/car_params/{car_id}")
async def get_car_params(car_id: str):
    params = car_service.get_car_params(car_id)
    if params:
        return params
    return {}


@router.post("/car_params/{car_id}")
async def save_car_params(car_id: str, params: Dict[str, Any]):
    if car_service.save_car_params(car_id, params):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to save car params")
