import json
import logging
import os
from typing import Any, Dict, Optional

from backend.core.config import CAR_DB_PATH, CAR_PARAMS_DIR

logger = logging.getLogger("backend.car_service")


class CarService:
    def __init__(self):
        self.car_database: Dict[str, Any] = {}
        self.load_car_database()

    def load_car_database(self):
        if os.path.exists(CAR_DB_PATH):
            try:
                with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
                    self.car_database = json.load(f)
                logger.info(f"Loaded {len(self.car_database)} cars from database.")
            except Exception as e:
                logger.error(f"Failed to load car database: {e}")

    def get_car_by_ordinal(self, ordinal: int) -> Optional[Dict[str, Any]]:
        return self.car_database.get(str(ordinal))

    def get_car_params(self, car_id: str) -> Optional[Dict[str, Any]]:
        file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load car params for {car_id}: {e}")
        return None

    def save_car_params(self, car_id: str, params: Dict[str, Any]) -> bool:
        file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(params, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to save car params for {car_id}: {e}")
            return False


car_service = CarService()
