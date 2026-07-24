import json
import logging
import os
from typing import Any, Dict, List

from backend.core.config import TUNINGS_DIR

logger = logging.getLogger("backend.tuning_service")


class TuningService:
    def list_tunings(self) -> List[Dict[str, Any]]:
        tunings = []
        if os.path.exists(TUNINGS_DIR):
            for fname in os.listdir(TUNINGS_DIR):
                if fname.endswith(".json"):
                    fpath = os.path.join(TUNINGS_DIR, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            data["filename"] = fname
                            tunings.append(data)
                    except Exception as e:
                        logger.error(f"Error reading tuning file {fname}: {e}")
        return tunings

    def save_tuning(self, name: str, data: Dict[str, Any]) -> str:
        safe_name = "".join(
            c for c in name if c.isalnum() or c in (" ", "_", "-")
        ).strip()
        filename = f"{safe_name}.json"
        fpath = os.path.join(TUNINGS_DIR, filename)
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return filename

    def delete_tuning(self, filename: str) -> bool:
        fpath = os.path.join(TUNINGS_DIR, filename)
        if os.path.exists(fpath):
            os.remove(fpath)
            return True
        return False


tuning_service = TuningService()
