"""Capture observable Python behavior for the Rust migration (never run in builds).

Only explicitly selected pure declarations are evaluated. Importing backend.main
would initialize application storage and native services in the source checkout.
"""

import ast
import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend-rust" / "tests" / "fixtures"


def load_config_reference():
    source = ast.parse((ROOT / "backend" / "main.py").read_text(encoding="utf-8"))
    names = {
        "DEFAULT_SETTINGS",
        "GENERAL_UNIT_PROFILES",
        "DEFAULT_HUD_CONFIG",
        "LEGACY_S650_STYLE_MAP",
        "S650_HMI_THEMES",
        "S650_HMI_CENTER_WIDGETS",
        "normalize_general_unit_settings",
        "merge_settings_patch",
        "normalize_hud_config",
        "hud_config_with_gui_theme",
    }
    body = []
    for node in source.body:
        name = getattr(node, "name", None)
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        if name in names:
            body.append(node)
    module = ast.fix_missing_locations(ast.Module(body=body, type_ignores=[]))
    namespace = {
        "SettingsPersistence": type(
            "SettingsPersistence", (), {"CURRENT_SCHEMA_VERSION": 2}
        ),
        "VFD_RENDER_MODE": "legacy",
    }
    exec(compile(module, str(ROOT / "backend" / "main.py"), "exec"), namespace)
    return namespace


def main():
    reference = load_config_reference()
    reference["app_settings"] = copy.deepcopy(reference["DEFAULT_SETTINGS"])
    cases = {"settings": [], "hud": [], "units": []}
    for patch in [
        {},
        {"units": {"speed": "mph", "power": "ps", "springRate": "lbfin"}},
        {"theme": {"mode": "light", "slots": [1], "customCSS": "x"}},
        {
            "dyno_recording": "false",
            "telemetry_port": "8020",
            "forward_telemetry_host": " localhost ",
        },
        {"unknown": 1, "mcp_max_downsample": 30, "language": None},
    ]:
        initial = copy.deepcopy(reference["DEFAULT_SETTINGS"])
        expected = copy.deepcopy(initial)
        reference["merge_settings_patch"](expected, patch)
        cases["settings"].append(
            {"initial": initial, "patch": patch, "expected": expected}
        )
    for hud in [
        {},
        reference["DEFAULT_HUD_CONFIG"],
        {"hudStyle": "s650_foxbody", "actualScale": 2, "s650CenterWidget": "x"},
        {"hudStyle": "s650_unrecognized", "s650Theme": "track"},
        {"hudStyle": "initial_d"},
        {"hudStyle": "defi_triple", "classicJdmShowTriple": False},
        {
            "hudStyle": "s650_hmi",
            "s650Theme": "track",
            "followAppUnits": False,
            "units": {"speed": "mph", "boostPressure": "invalid", "power": "ps"},
        },
    ]:
        cases["hud"].append(
            {
                "input": hud,
                "normalized": reference["normalize_hud_config"](hud),
                "frontend": reference["hud_config_with_gui_theme"](hud),
                "settings": reference["app_settings"],
            }
        )
    for units in [
        {},
        None,
        {"speed": "mph", "temperature": "C", "power": "kw"},
        {"speed": "invalid", "custom": 123},
    ]:
        cases["units"].append(
            {
                "input": units,
                "expected": reference["normalize_general_unit_settings"](units),
            }
        )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "config.json").write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    generate_motec()
    generate_native()


def generate_native():
    import math

    from audio_spectrum import _compute_fft_bands
    from diagnostic_support_bundle import redact_value

    cases = []
    for length in [32, 128, 194, 1024]:
        samples = [math.sin(i * 0.13) * 0.25 for i in range(length)]
        spectrum, left, right = _compute_fft_bands(samples)
        cases.append(
            {"samples": samples, "spectrum": spectrum, "left": left, "right": right}
        )
    value = {"pcm": cases, "redaction": []}
    for data in [
        {"password": "secret", "safe": "hello a@b.com"},
        [
            "C:\\Users\\person\\settings.json",
            "token=secret",
            "raw udp: bytes",
            "http://localhost:8001",
            "/root/user/file",
        ],
        {"payload": 123, "nested": {"counter": 4, "username": "person"}},
    ]:
        value["redaction"].append({"input": data, "expected": redact_value(data)})
    (OUTPUT / "native.json").write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def generate_motec():
    sys.path.insert(0, str(ROOT / "backend"))
    from motec_exporter import (
        calculate_session_debrief,
        export_session_to_motec_csv,
        parse_motec_csv_to_telemetry,
    )

    metadata = {"session_id": "fixture", "car_name": "測試, Car"}
    points = [
        {
            "time": 0,
            "LapNumber": 1,
            "SpeedMetersPerSecond": 20,
            "CurrentEngineRpm": 4000,
            "Gear": 3,
            "AccelInput": 127,
            "SteerInput": -60,
            "AccelerationX": 5,
            "PowerWatts": 150000,
            "TorqueNewtons": 300,
            "TireTemp": [160, 180, None, 212],
            "SuspTravel": [0.96, None, 0.5, 0.6],
            "TireSlipAngle": [0.8, 0.7, 0.1, 0.2],
            "PositionX": 123,
            "PositionY": 5,
            "PositionZ": -250,
        },
        {"time": 0.1, "LapNumber": 1, "SpeedMetersPerSecond": 0},
        {"time": 0.2, "LapNumber": 2, "LastLap": 72.5},
    ]
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "export.csv"
        assert export_session_to_motec_csv(metadata, points, str(path))
        csv_bytes = path.read_bytes()
        parsed_metadata, parsed = parse_motec_csv_to_telemetry(str(path))
    (OUTPUT / "motec.csv").write_bytes(csv_bytes)
    value = {
        "metadata": metadata,
        "points": points,
        "parsedMetadata": parsed_metadata,
        "parsed": parsed,
        "debrief": calculate_session_debrief(points),
        "emptyDebrief": calculate_session_debrief([]),
    }
    (OUTPUT / "motec.json").write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
