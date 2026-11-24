"""Windows worker for the developer Auto Tune tab. Run via the Tauri host."""

import argparse
import json
import os
import time
import traceback
from pathlib import Path

if __name__ == "__main__" and not __package__:
    import sys

    directory = Path(__file__).resolve().parent
    sys.path.insert(0, str(directory.parent))
    __package__ = directory.name

from .device import Device, Stopped, publish_snapshot


class Run:
    def __init__(self, output):
        self.output = output
        self.output.mkdir(exist_ok=True, parents=True)
        self.start = time.monotonic()
        self.data = dict(
            status="running", step=1, observed={}, recommended={}, logs=[], elapsedMs=0
        )
        self.save()

    def save(self):
        self.data["elapsedMs"] = round((time.monotonic() - self.start) * 1000)
        tmp = self.output / "state.tmp"
        tmp.write_text(
            json.dumps(self.data, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
        publish_snapshot(tmp, self.output / "state.json")

    def log(self, message):
        elapsed = round((time.monotonic() - self.start) * 1000)
        self.data["logs"].append(dict(elapsedMs=elapsed, message=str(message)))
        self.save()

    def values(self, category, values):
        def add(prefix, value):
            if isinstance(value, dict):
                for child, item in value.items():
                    add(f"{prefix}.{child}", item)
            elif isinstance(value, bool):
                self.data[category][prefix] = str(value).lower()
            elif isinstance(value, (str, int, float)):
                self.data[category][prefix] = value

        for key, value in values.items():
            add(key, value)
        self.save()

    def step(self, n, message):
        self.data["step"] = n
        self.log(message)

    def artifact(self, name, values):
        (self.output / name).write_text(
            json.dumps(values, ensure_ascii=False, indent=2, allow_nan=False),
            encoding="utf-8",
        )


def run(args):
    state = Run(args.output)
    device = None
    try:
        from .collect import collect_profile
        from .measurement import baseline, identify, measure_and_return, solve
        from .sliders import apply

        state.log(f"OCR 引擎：{os.environ.get('FH6_OCR_ENGINE', 'onnx')}")
        from .ocr_session import prepare

        prepare()
        state.log("讀取目前車輛及已安裝零件")
        if args.goal not in {"Road", "Rally", "Drag"}:
            raise ValueError("此目標需要在既有調校分頁提供額外參數")
        device = Device(
            state,
            args.port,
            args.goal,
            args.season,
            expected_car_name=args.expected_car_name,
            parent_pid=args.parent_pid,
        )
        profile = collect_profile(device)
        profile["carId"] = identify(device, profile["carName"])
        device.car_id = profile["carId"]
        state.artifact("profile.json", profile)
        if (
            profile.get("isElectric")
            or profile["adjustability"]["gears"] < 3
            or profile["adjustability"]["gearbox"] == "Fixed"
        ):
            raise ValueError("此車設定無法完成三檔量測與齒比套用")
        state.values(
            "observed",
            {k: v for k, v in profile.items() if isinstance(v, (str, int, float))},
        )
        state.step(2, "以 Rust 工作流計算底盤與輪胎建議")
        result = baseline(device, profile)
        state.artifact("baseline.json", result)
        preview = result["baselinePreview"]
        if not result["readiness"]["mechanical"] or preview["missingInputs"]:
            raise ValueError(f"底盤輸入不完整：{preview['missingInputs']}")
        settings = {
            row["key"]: dict(value=row["recommended"], unit=row["unit"])
            for row in preview["fields"]
            if row["status"] == "available" and row["recommended"] is not None
        }
        if not settings:
            raise RuntimeError("沒有可套用的底盤建議")
        unavailable = [
            row["key"] for row in preview["fields"] if row["status"] == "unavailable"
        ]
        if unavailable:
            raise RuntimeError("底盤建議缺少必要的測值：" + ", ".join(unavailable))

        def publish(values):
            state.values(
                "recommended",
                {k: f"{v['value']:g} {v['unit']}" for k, v in values.items()},
            )

        publish(settings)
        apply(device, profile, settings, already_open=True)
        state.step(3, "底盤已讀回，前往直線測試場")
        samples, ready = measure_and_return(device, profile)
        result = solve(device, profile, samples, ready)
        state.artifact("workflow.json", result)
        rec = result.get("recommendation")
        if (
            not rec
            or not result["readiness"]["measuredEngine"]
            or not result["readiness"]["gearingAvailable"]
        ):
            raise RuntimeError("實測資料未通過 Rust 齒比計算")
        final = rec["fields"]
        publish(final)
        # Apply every final field, including any mechanical result differing from the baseline.
        apply(device, profile, final)
        state.data["status"] = "completed"
        state.log("Step 1～3 完成，已重新開啟調校頁並核對套用值")
        return 0
    except (Exception, KeyboardInterrupt) as exc:
        state.data["status"] = (
            "stopped" if isinstance(exc, (Stopped, KeyboardInterrupt)) else "failed"
        )
        state.log(str(exc) or type(exc).__name__)
        (state.output / "worker-error.txt").write_text(
            traceback.format_exc(), encoding="utf-8"
        )
        return 1
    finally:
        if device:
            device.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--goal", required=True)
    parser.add_argument("--season", required=True)
    parser.add_argument("--ocr-engine", choices=("windows", "onnx"))
    parser.add_argument("--ocr-runtime", type=Path)
    parser.add_argument("--expected-car-name")
    parser.add_argument("--parent-pid", type=int)
    args = parser.parse_args()
    if args.ocr_engine:
        os.environ["FH6_OCR_ENGINE"] = args.ocr_engine
    if args.ocr_runtime:
        os.environ["FH6_OCR_RUNTIME"] = str(args.ocr_runtime.resolve())
    raise SystemExit(run(args))
