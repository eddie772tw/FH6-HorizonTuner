"""Stage a whole page in game units, then verify the whole batch before applying."""

import math
import re

from .vision import Raster, lime, read_tuning_page

PAGES = {
    "tyres": (210, {"pressure"}),
    "alignment": (355, {"toe", "camber", "caster"}),
    "arb": (432, {"arb"}),
    "springs": (495, {"spring", "height"}),
    "damping": (545, {"rebound", "bump"}),
    "diff": (743, {"diff"}),
    "gears": (278, {"gearing"}),
}


def identity(name):
    return re.sub(r"[^\w]", "", name).casefold()


def verify_car(page, profile):
    car = identity(page.get("car") or "")
    expected = identity(profile["carName"])
    if not car or not expected or car != expected:
        raise RuntimeError(f"車輛辨識不一致：{page.get('car')} / {profile['carName']}")


def setting(key, unit, goal):
    family = key.split(".")[0]
    if not unit or not math.isfinite(goal):
        raise ValueError(f"{key} 的遊戲單位或建議值無法確認")
    u = unit.lower().strip()
    if family == "spring":
        factor = {
            "lb/in": 0.0178579673228,
            "kgf/mm": 1.0,
            "kg/mm": 1.0,
            "n/mm": 1 / 9.80665,
        }[u]
        # A local four-tap measurement on DB5 gives 0.5 lb/in in imperial mode.
        return goal / factor, 0.5 if u == "lb/in" else None, factor
    if family == "height":
        factor = {"cm": 1, "in": 2.54, "mm": 0.1}[u]
        return goal / factor, 0.1 if u == "in" else None, factor
    if family == "pressure":
        factor = {"psi": 1, "bar": 14.503773773, "kpa": 0.14503773773}[u]
        return goal / factor, 0.5 if u == "psi" else None, factor
    step = {
        "toe": 0.1,
        "camber": 0.1,
        "caster": 0.1,
        "rebound": 0.1,
        "bump": 0.1,
        "arb": 0.1,
        "diff": 1,
        "gearing": 0.01,
    }[family]
    return goal, step, 1


def validate(page, tab, items, profile):
    if page.get("page") != "tuning." + tab:
        raise RuntimeError(f"預期 {tab}，實際為 {page.get('page')}")
    verify_car(page, profile)
    for key in items:
        row = page["rows"].get(key)
        value = page["fields"].get(key)
        if (
            not row
            or row["locked"]
            or not isinstance(value, (float, int))
            or not math.isfinite(value)
        ):
            raise RuntimeError(f"無法讀取或操作 {key}")


def adjust_page(dev, tab, items, profile, verify_only=False):
    dev.click(PAGES[tab][0], 91)
    dev.wait(0.22)
    observed_units = {}

    def read():
        for attempt in range(2):
            try:
                capture = dev.capture(tab)
                page = read_tuning_page(capture)
                if attempt == 0 and page["page"] != "tuning." + tab:
                    verify_car(page, profile)
                    dev.click(PAGES[tab][0], 91)
                    dev.wait(0.5)
                    continue
                page["source"] = getattr(capture, "name", "")
                validate(page, tab, items, profile)
                for key in items:
                    unit = page["units"].get(key)
                    if unit and key in observed_units and unit != observed_units[key]:
                        raise RuntimeError(f"{key} 單位在調整期間改變")
                    if unit:
                        observed_units[key] = unit
                    elif key in observed_units:
                        page["units"][key] = observed_units[key]
                    else:
                        raise RuntimeError(f"無法確認 {key} 的單位")
                return page
            except (RuntimeError, ValueError):
                if attempt:
                    raise
                dev.wait(0.35)

    page = read()
    if not verify_only:
        dev.observed(
            {
                key: f"{page['fields'][key]:g} {page['units'][key]}"
                for key in items
                if key not in dev.state.data["observed"]
            }
        )
    changed = False
    # A displayed metric increment can depend on the underlying game unit. Read
    # a bounded batch on the actual installed setup and reuse it on post-apply verification.
    calibration = {}
    for key, spec in items.items():
        unit = page["units"][key]
        target, step, _ = setting(key, unit, spec["value"])
        if (
            step is None
            and (key, unit) not in dev.increments
            and abs(target - page["fields"][key]) > 1e-8
        ):
            if verify_only:
                raise RuntimeError(f"{key} 缺少步進校準")
            direction = 1 if target > page["fields"][key] else -1
            dev.click(320, page["rows"][key]["y"])
            dev.tap("RIGHT" if direction > 0 else "LEFT", 4)
            calibration[key] = (page["fields"][key], unit, direction)
    if calibration:
        page = read()
        changed = True
        for key, (previous, unit, direction) in calibration.items():
            increment = (page["fields"][key] - previous) * direction / 4
            if not math.isfinite(increment) or increment <= 0:
                raise RuntimeError(f"{key} 無法測出步進")
            dev.increments[key, unit] = increment
    for attempt in range(5):
        errors = []
        for key, spec in items.items():
            target, step, factor = setting(key, page["units"][key], spec["value"])
            delta = target - page["fields"][key]
            if abs(delta) < 1e-8:
                continue
            step = step or dev.increments[key, page["units"][key]]
            if abs(delta) > step * 0.50001:
                errors.append((key, target, step, factor, delta))
        if not errors:
            if verify_only and hasattr(dev, "verified"):
                for key, spec in items.items():
                    dev.verified[key] = {
                        "observed": page["fields"][key],
                        "unit": page["units"][key],
                        "recommended": spec,
                        "screenshot": page["source"],
                    }
            return changed
        if verify_only or attempt == 4:
            raise RuntimeError(
                f"{tab} 讀回不符："
                + ", ".join(f"{k} {page['fields'][k]} → {t:.3f}" for k, t, *_ in errors)
            )
        # Higher gears constrain the lower gears. Correct from top gear downward when lowering.
        if tab == "gears" and sum(e[4] for e in errors) < 0:
            errors.reverse()
        for key, target, step, factor, delta in errors:
            row = page["rows"][key]
            family = key.split(".")[0]
            taps = round(delta / step)
            use_range = (family in {"spring", "height"} and abs(taps) > 4) or (
                family == "arb" and abs(taps) > 20
            )
            if attempt == 0 and use_range:
                lo = profile[key.replace(".", "_") + "_min"] / factor
                hi = profile[key.replace(".", "_") + "_max"] / factor
                if not lo <= target <= hi or hi <= lo:
                    raise ValueError(f"{key} 目標超出觀測範圍")
                x = row["xMin"] + (target - lo) / (hi - lo) * (
                    row["xMax"] - row["xMin"]
                )
                dev.click(x, row["y"])
            elif attempt == 0 and family == "gearing" and abs(taps) > 25:
                # Calibrated rail scale is only a first placement. Acceptance always uses numeric OCR.
                scale = 35.5 if key.endswith("finalDrive") else 25.1
                x = max(row["xMin"], min(row["xMax"], row["thumbX"] + delta * scale))
                dev.click(x, row["y"])
            else:
                if abs(taps) > 300:
                    raise ValueError(f"{key} 殘差超過校正範圍")
                dev.click(320, row["y"])
                dev.tap("RIGHT" if taps > 0 else "LEFT", abs(taps))
            changed = True
        dev.wait(0.22)
        page = read()


def text_at(dev, label, boxes):
    return {
        k: "".join(v.split()) for k, v in dev.ocr(dev.capture(label), boxes).items()
    }


def open_editor(dev):
    for _ in range(3):
        labels = text_at(dev, "garage", {"entry": (40, 321, 196, 352)})
        if "自訂調校" in labels["entry"]:
            break
        dev.wait(0.35)
    else:
        raise RuntimeError("找不到升級套件的自訂調校入口")
    dev.click(90, 337)
    dev.wait(0.8)


def apply(dev, profile, fields, already_open=False):
    if not already_open:
        open_editor(dev)
    recognized = set()
    changed = False
    for tab, (_, families) in PAGES.items():
        items = {k: v for k, v in fields.items() if k.split(".")[0] in families}
        if items:
            dev.log(f"調整 {tab}，核對 {len(items)} 項")
            changed = adjust_page(dev, tab, items, profile) or changed
            recognized.update(items)
    if recognized != set(fields):
        raise RuntimeError("尚未支援的建議欄位：" + ", ".join(set(fields) - recognized))
    if changed:
        dev.tap("ENTER")
        dev.wait(0.45)
        for _ in range(3):
            path = dev.capture("confirm")
            modal = "".join(
                dev.ocr(path, {"dialog": (304, 198, 654, 338)})["dialog"].split()
            )
            with Raster(path) as image:
                yes_selected = any(
                    lime(image.pixel(x, 293)) for x in (311, 311.5, 312, 312.5, 313)
                )
            if "套用設定" in modal and "是否要套用目前的設定" in modal and yes_selected:
                break
            dev.wait(0.35)
        else:
            raise RuntimeError("無法確認套用設定對話框")
        dev.click(480, 293)
    else:
        dev.tap("ESC")
    dev.wait(0.85)
    # Confirm persisted values through a fresh editor, preserving the expected exit scene.
    open_editor(dev)
    dev.verified = {}
    for tab, (_, families) in PAGES.items():
        items = {k: v for k, v in fields.items() if k.split(".")[0] in families}
        if items:
            adjust_page(dev, tab, items, profile, verify_only=True)
    dev.tap("ESC")
    dev.wait(0.7)
    dev.state.artifact(f"step{dev.state.data['step']}-verified.json", dev.verified)
