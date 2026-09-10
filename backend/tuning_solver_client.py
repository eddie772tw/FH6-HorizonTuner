"""Transport to the canonical TypeScript solver; contains no tuning algorithms."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def solve_tuning(request: dict[str, Any]) -> dict[str, Any]:
    """Execute the shared headless solver, failing explicitly instead of approximating."""
    root = Path(__file__).resolve().parents[1]
    if getattr(sys, "frozen", False):
        runner = Path(sys._MEIPASS) / "tuning-solver/tuning-solver.mjs"
    else:
        runner = root / "frontend/scripts/tuning-solver.mjs"
    node = shutil.which("node")
    if not node or not runner.is_file():
        raise RuntimeError(
            "Shared TypeScript solver unavailable. Install Node.js 22.12+ and frontend "
            "dependencies; packaged CLI also requires the build:solver artifact. "
            "No Python fallback is used."
        )
    try:
        result = subprocess.run(
            [node, str(runner)],
            input=json.dumps(request, allow_nan=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            timeout=30,
            cwd=str(root),
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            "Shared TypeScript solver timed out after 30 seconds"
        ) from exc
    if result.returncode:
        raise RuntimeError(f"Shared TypeScript solver failed: {result.stderr.strip()}")
    response = json.loads(result.stdout)
    if (
        not isinstance(response, dict)
        or response.get("schemaVersion") != "tuning-solver/v1"
    ):
        raise RuntimeError("Invalid shared solver response")
    return response


class TuningMathClient:
    """Adapt CLI inputs and outputs; delegate all calculations to the shared TS service."""

    @staticmethod
    def calculate_chassis(
        weight_kg: float,
        front_weight_bias: float,
        drivetrain: str = "RWD",
        purpose: str = "road",
        aero_f: float = 0.0,
        aero_r: float = 0.0,
        season: str = "Summer",
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Legacy CLI accepts a fraction or percentage; the solver accepts percent.
        bias = (
            front_weight_bias * 100 if 0 < front_weight_bias <= 1 else front_weight_bias
        )
        return solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "chassis",
                "goal": purpose.title(),
                "season": season,
                # These legacy CLI flags are lbf, unlike canonical kgf fields.
                # General chassis math excludes aero; preserve them as metadata only.
                "ignoredLegacyAeroLbf": {"front": aero_f, "rear": aero_r},
                "params": {
                    **(params or {}),
                    "weight": weight_kg,
                    "weight_distribution": bias,
                    "drivetrain": drivetrain.upper(),
                    "maxHp": (params or {}).get("maxHp", 0),
                    "maxTorque": (params or {}).get("maxTorque", 0),
                    "maxHpRpm": (params or {}).get("maxHpRpm", 0),
                    "maxTorqueRpm": (params or {}).get("maxTorqueRpm", 0),
                    "aero_downforce_front": (params or {}).get(
                        "aero_downforce_front", 0
                    ),
                    "aero_downforce_rear": (params or {}).get("aero_downforce_rear", 0),
                },
            }
        )["chassis"]

    @staticmethod
    def calculate_gearing(
        max_rpm: float,
        peak_hp_rpm: float,
        top_speed_kmh: float,
        gears_count: int = 6,
        tire_diameter_cm: float | None = 65.0,
        *,
        purpose: str = "road",
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        request = {
            "schemaVersion": "tuning-solver/v1",
            "action": "gearing",
            "goal": purpose.title(),
            "numGears": gears_count,
            "params": params
            or {
                "weight": 1400,
                "weight_distribution": 50,
                "drivetrain": "RWD",
                "maxHp": 0,
                "maxTorque": 0,
                "maxHpRpm": peak_hp_rpm,
                "maxTorqueRpm": 0,
            },
            "engine": {
                "maxRpm": max_rpm,
                "maxHpRpm": peak_hp_rpm,
                "maxTorqueRpm": (params or {}).get("maxTorqueRpm", 0),
            },
            "correction": {"targetSpeedKmh": top_speed_kmh, "targetRpm": peak_hp_rpm},
        }
        if tire_diameter_cm is not None:
            request["tireDiameterCm"] = tire_diameter_cm
        return solve_tuning(request)["gearing"]

    @classmethod
    def export_applied_setup(
        cls, chassis: dict[str, Any], gearing: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Converts solver output into AppliedTuningSetup dictionary matching frontend Step 5."""
        setup = dict(chassis["appliedSetup"])
        if gearing is not None:
            setup["finalDrive"] = gearing["final_drive"]
        return setup

    @classmethod
    def export_preset_format(
        cls,
        car_id: int | str,
        vehicle_class: str,
        chassis: dict[str, Any],
        gearing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generates a TuningPresetV1 compatible dictionary for frontend and API persistence."""
        applied = cls.export_applied_setup(chassis, gearing)
        return {
            "schemaVersion": "tuning-preset/v1",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "gameBuild": "unknown",
            "vehicleClass": vehicle_class.upper(),
            "profileUsed": chassis.get("goal", "road"),
            "installedParts": {},
            "parameters": {
                "tire_pressure_f": applied["tirePressureFront"],
                "tire_pressure_r": applied["tirePressureRear"],
                "camber_front": applied["camberFront"],
                "camber_rear": applied["camberRear"],
                "toe_front": applied["toeFront"],
                "toe_rear": applied["toeRear"],
                "caster": applied["caster"],
                "arb_front": applied["arbFront"],
                "arb_rear": applied["arbRear"],
                "spring_front": applied["springsFront"],
                "spring_rear": applied["springsRear"],
                "rebound_front": applied["reboundFront"],
                "rebound_rear": applied["reboundRear"],
                "bump_front": applied["bumpFront"],
                "bump_rear": applied["bumpRear"],
                "diff_accel_rear": applied["diffAccelRear"],
                "diff_decel_rear": applied["diffDecelRear"],
                "diff_accel_front": applied.get("diffAccelFront", "unknown"),
                "diff_decel_front": applied.get("diffDecelFront", "unknown"),
                "diff_center_rear": applied.get("diffCenterRear", "unknown"),
                **{
                    f"gear_{gear['gear']}": gear["ratio"]
                    for gear in (gearing or {}).get("gears", [])
                },
                "final_drive": applied.get("finalDrive", "unknown"),
                "ride_height_f": applied["rideHeightFront"],
                "ride_height_r": applied["rideHeightRear"],
            },
            "solverOutputSnapshot": {
                "chassis": chassis,
                "gearing": gearing,
            },
            "calibrationStatus": "unverified",
        }
