"""Acquire a vehicle profile from the active garage through visible game menus."""

import json
import re
from pathlib import Path

from .car_card import canonical_stats, read_card_stats
from .shop import (
    compound,
    forced_induction,
    known_engine_layout,
    read_part,
    read_tire_size,
    shop_labels,
)
from .vision import (
    HEADER,
    Raster,
    compact,
    identity,
    ocr,
    ocr_regions,
    read_tuning_page,
    select_tuning_tab,
    selected_tile,
    tuning_tabs,
)


def _frame(d, name):
    d.wait(0.8)
    return d.capture(name)


def _keys(d, *keys):
    for key in keys:
        d.tap(key)
        d.wait(0.85 if key in ("ESC", "ENTER") else 0.18)


def _classify_scene(p):
    labels = ocr(
        p,
        {
            "options": (43, 240, 180, 346),
            "heading": (32, 79, 217, 115),
            "tab": (239, 74, 293, 100),
            "cardtab": (217, 76, 346, 102),
            "hudunit": (853, 434, 943, 526),
            "modal": (317, 203, 643, 246),
            "dialog": (305, 197, 654, 337),
        },
        single_line=("heading", "tab", "cardtab", "modal"),
    )
    modal, prompt = compact(labels["modal"]), compact(labels["dialog"])
    if "設定已變更" in modal and "是否立即套用" in prompt:
        return "discard"
    if "套用設定" in modal and "是否要套用" in prompt:
        return "apply"
    text = compact(labels["options"])
    if compact(labels["cardtab"]) == "目前車輛":
        return "card"
    if "自訂調校" in text and "自訂升級" in text:
        return "upgrades"
    # OCR sometimes drops 級 in the highlighted row. The two adjacent menu items
    # still identify the Cars screen independently of that glyph.
    if "我的車輛" in text and ("升級套件" in text or "套件與調校" in text):
        return "garage"
    with Raster(p) as im:
        if len(tuning_tabs(im)) == 1:
            # Verify actual rails separately. A garage grid may also have a lime tab.
            try:
                if read_tuning_page(p)["rows"]:
                    return "tuning"
            except ValueError:
                pass
    heading = shop_labels(p)["heading"].strip("~·.。")
    if heading in (
        "升級商店",
        "引擎",
        "輪胎與輪圈",
        "前輪胎寬",
        "後輪胎寬",
        "前輪圈尺寸",
        "後輪圈尺寸",
        "輪胎踏面膠料",
    ):
        return "shop"
    hud = compact(labels["hudunit"]).upper()
    if re.search(r"(MPH|KM/H|KMH)", hud):
        return "driving"
    raise ValueError(f"請在嘉年華或車庫的車輛／升級套件頁面開始。畫面文字 {text}")


def _garage_attract_frame(path):
    # The garage camera hides the active-car header and all footer prompts.
    # Both letterbox bands stay black while the showroom remains illuminated.
    with Raster(path) as im:
        dark = [
            max(im.pixel(x, y)) < 18
            for y in (24, 32, 497, 503, 512)
            for x in range(32, 900, 9)
        ]
        lit = [
            max(im.pixel(x, y)) > 70
            for y in (120, 250, 400)
            for x in range(40, 920, 40)
        ]
    return sum(dark) / len(dark) > 0.985 and sum(lit) / len(lit) > 0.2


def _scene(d):
    last_error = None
    for attempt in range(4):
        path = _frame(d, "garage")
        try:
            return _classify_scene(path)
        except ValueError as exc:
            last_error = exc
        if attempt == 0:
            # Wake the idle camera without changing a menu choice.
            d.hover(478, 411)
        elif attempt == 1 and _garage_attract_frame(path):
            d.log("喚醒車庫待機畫面")
            d.tap("UP")
    raise last_error


def _read_card(path):
    with Raster(path) as im:
        tile = selected_tile(im, False)
    if not tile:
        raise ValueError("車庫未能辨識所選車卡")
    x, y = tile
    raw = ocr_regions(
        path,
        {
            "header": (HEADER, "en-US", ""),
            "card": ((x + 3, y, x + 166, y + 46), "en-US", ""),
            "current": ((217, 76, 346, 102), "zh-Hant-TW", ""),
            "pi": ((16, 16, 73, 44), "en-US", "light"),
            "cardpi": ((54, 410, 123, 443), "en-US", "light"),
            "drive": ((124, 414, 160, 443), "en-US", ""),
        },
        single_line=("header", "current", "pi", "cardpi", "drive"),
    )
    name = identity(raw["header"])
    car_words = re.findall("[a-z0-9]+", name.lower())
    card_words = re.findall("[a-z0-9]+", raw["card"].lower())
    if compact(raw["current"]) != "目前車輛" or sorted(car_words) != sorted(card_words):
        raise ValueError(f"車卡與目前車輛不符 {raw}")
    rating = re.fullmatch(r"(S1|S2|[ABCDX])(\d{3,4})", compact(raw["pi"]))
    if not rating or compact(raw["pi"]) != compact(raw["cardpi"]):
        raise ValueError(f"車卡 PI 無法核對 {raw}")
    drive = compact(raw["drive"]).upper()
    drivetrain = {
        "AWD": "AWD",
        "FWD": "FWD",
        "RWD": "RWD",
        "前驅": "FWD",
        "後驅": "RWD",
        "四輪驅動": "AWD",
        "全輪驅動": "AWD",
    }.get(drive)
    if drivetrain is None:
        raise ValueError(f"讀不到驅動方式 {raw['drive']}")
    profile = {
        "carName": name,
        "performanceIndex": int(rating[2]),
        "carClass": rating[1],
        "drivetrain": drivetrain,
    }
    profile.update(canonical_stats(read_card_stats(path)))
    return profile


def _find_tires(d):
    """Prefer direct navigation on the known grid, fall back to the alternate size category."""

    def category(frame_name):
        for _ in range(3):
            menu = shop_labels(_frame(d, frame_name))
            if "輪胎與輪圈" in menu["heading"] and menu["item"]:
                return menu
        if "輪胎與輪圈" not in menu["heading"]:
            raise ValueError(f"輪胎分類無法確認 {menu}")
        return menu

    def read_installed(name, reader):
        for attempt in range(3):
            try:
                return reader(_frame(d, name))
            except ValueError:
                if attempt == 2:
                    raise

    labels = category("tyres-menu")
    output = {}

    def inspect_selected(menu):
        label = menu["item"]
        if not label:
            d.log("分類名稱無法讀取，繼續搜尋輪胎尺寸")
            return
        axle = next(
            (
                a
                for a, prefix in (("front", "前"), ("rear", "後"))
                if label in (prefix + "輪胎寬", prefix + "輪圈尺寸")
            ),
            None,
        )
        if "踏面膠料" in label and "tireType" not in output:
            _keys(d, "ENTER")
            output["tireType"] = read_installed(
                "installed-compound", lambda p: compound(read_part(p))
            )
            _keys(d, "ESC")
        if axle and axle + "TireWidth" not in output:
            _keys(d, "ENTER")
            try:
                width, aspect, rim = read_installed(
                    "installed-" + axle, lambda p: read_tire_size(p, axle)
                )
                output.update(
                    {
                        axle + "TireWidth": width,
                        axle + "TireAspect": aspect,
                        axle + "TireRim": rim,
                    }
                )
            except ValueError as exc:
                d.log(str(exc))
            _keys(d, "ESC")

    for col in range(3):
        if col:
            _keys(d, "RIGHT")
            labels = category("tyre-category")
        inspect_selected(labels)
        if len(output) == 7:
            return output
    _keys(d, "ESC", "ENTER")
    seen_columns = set()
    for _ in range(3):
        visited = set()
        for _ in range(9):
            menu = category("tyre-category")
            label = menu["item"]
            if not visited:
                if label in seen_columns:
                    break
                seen_columns.add(label)
            if label in visited:
                break
            visited.add(label)
            inspect_selected(menu)
            if len(output) == 7:
                return output
            _keys(d, "DOWN")
        _keys(d, "RIGHT")
    raise ValueError(
        f"輪胎尺寸或胎料缺少可辨識的已安裝項目，已搜尋胎寬及輪圈尺寸。取得 {output}"
    )


def _engine(d):
    first = _frame(d, "engine-top")
    layout = json.loads(
        Path(__file__).with_name("engine_tiles.json").read_text(encoding="utf-8")
    )
    if shop_labels(first)["heading"] != "引擎":
        raise ValueError("無法確認引擎升級分類")
    if known_engine_layout(first, layout["first"]):
        _keys(d, "RIGHT")
        throttle = shop_labels(_frame(d, "throttle"))
        _keys(d, "DOWN", "DOWN", "DOWN")
        last = _frame(d, "engine-bottom")
        if (
            known_engine_layout(last, layout["last"])
            and "節氣門" in throttle["item"]
            and "自然進氣" in throttle["description"]
        ):
            return "NA"
        # Return to a known category start if at a different engine layout.
        _keys(d, "ESC", "ENTER")
    observed_na = False
    for _ in range(3):
        seen = set()
        for _ in range(10):
            data = shop_labels(_frame(d, "engine-category"))
            label = data["item"]
            if data["heading"] != "引擎" or not label:
                raise ValueError(f"引擎分類無法辨識 {data}")
            if label in seen:
                break
            seen.add(label)
            kind = forced_induction(label)
            if kind:
                return kind
            if "節氣門" in label and "自然進氣" in data["description"]:
                observed_na = True
            _keys(d, "DOWN")
        _keys(d, "RIGHT")
    if observed_na:
        return "NA"
    raise ValueError("引擎升級未找到可確認的渦輪、機械增壓或自然進氣特徵")


def _shop(d):
    d.click(95, 255)
    first = shop_labels(_frame(d, "upgrade-shop"))
    if "引擎" not in first["item"]:
        raise ValueError(f"升級商店未選取引擎 {first}")
    _keys(d, "ENTER")
    induction = _engine(d)
    d.log(f"進氣方式 {induction}")
    _keys(d, "ESC")
    menu = shop_labels(_frame(d, "shop-after-engine"))
    if "升級商店" not in menu["heading"]:
        raise ValueError(f"尚未返回升級商店 {menu}")
    d.click(86, 209)
    selected = shop_labels(_frame(d, "tyres-category"))
    if "輪胎與輪圈" not in selected["heading"]:
        if (
            "升級商店" not in selected["heading"]
            or "輪胎與輪圈" not in selected["item"]
        ):
            raise ValueError(f"找不到輪胎與輪圈 {selected}")
        _keys(d, "ENTER")
    profile = _find_tires(d)
    _keys(d, "ESC", "ESC")
    return dict(**profile, induction=induction, isElectric=False)


def _bounds(d, tab, profile, before):
    rows = before["rows"]
    available = {k: r for k, r in rows.items() if not r["locked"]}
    if not available:
        return before, False
    data = before
    for end in ("min", "max"):
        for key, row in available.items():
            # Start at the track endpoint, then tap toward the stop to overcome the
            # thumb's click hitbox. A click on the existing thumb alone may do nothing.
            endpoint = 517 if end == "min" else 659
            thumb = data["rows"][key]["thumbX"]
            if thumb is None:
                raise ValueError(f"{key} 無法定位滑桿")
            if abs(thumb - endpoint) < 9:
                d.click(588, row["y"])
            d.click(endpoint, row["y"])
            d.tap("LEFT" if end == "min" else "RIGHT", count=3)
        data = read_tuning_page(_frame(d, tab + "-" + end))
        if data["page"] != before["page"]:
            raise ValueError("量測範圍時頁面改變")
        for warning in data.get("warnings", []):
            d.log(warning)
        for key in available:
            row = data["rows"][key]
            if (
                row.get("thumbX") is None
                or abs(row["thumbX"] - (517 if end == "min" else 659)) > 2.8
            ):
                raise ValueError(f"{key} 無法確認 {end} 端點")
            raw = data["fields"][key]
            unit = data["units"][key]
            factor = {
                "lb/in": 0.0178579673228,
                "kgf/mm": 1,
                "n/mm": 1 / 9.80665,
                "in": 2.54,
                "cm": 1,
                "mm": 0.1,
                "slider": 1,
            }.get(unit)
            if factor is None:
                raise ValueError(f"{key} 無法確認單位 {unit}")
            profile[key.replace(".", "_") + "_" + end] = raw * factor
    return before, True


def _discard(d):
    _keys(d, "ESC")
    path = _frame(d, "discard-prompt")
    data = ocr_regions(path, {"dialog": ((305, 197, 654, 337), "zh-Hant-TW", "")})
    if "設定已變更" not in compact(data["dialog"]):
        raise ValueError(f"無法確認還原對話框 {data}")
    # The second visible button declines saving. Pointer position from the
    # range sweep must not determine whether the initial focus is Yes or No.
    d.click(480, 319)
    if _scene(d) != "upgrades":
        raise ValueError("範圍量測完成，但未能確認已捨棄暫時的改動")


def collect_profile(d):
    """Start on the Cars/Upgrades garage menu. Return observed fields, leaving Tuning open."""
    scene = _scene(d)
    expected = getattr(d, "expected_car_name", None)
    if expected and scene not in ("garage", "upgrades", "card"):
        raise ValueError("Agent 自動調校需從目標車輛的嘉年華車庫開始")
    if scene == "driving":
        from .measurement_route import return_to_garage

        return_to_garage(d)
        scene = _scene(d)
    for _ in range(7):
        if scene not in ("tuning", "apply", "discard", "shop"):
            break
        if scene in ("apply", "discard"):
            d.log("取消上次尚未確認的調校改動")
            d.click(480, 319)
        else:
            _keys(d, "ESC")
        scene = _scene(d)
    if scene == "upgrades":
        _keys(d, "ESC")
        scene = _scene(d)
    if scene == "garage":
        d.click(99, 282)
    elif scene != "card":
        raise ValueError("未進入車輛頁")
    path = _frame(d, "current-car")
    for _ in range(3):
        with Raster(path) as image:
            if selected_tile(image, False):
                break
        path = _frame(d, "current-car-transition")
    try:
        profile = _read_card(path)
    except ValueError as exc:
        # The garage L shortcut changes the information panel on this card.
        if "缺少車輛參數" not in str(exc):
            raise
        for _ in range(2):
            _keys(d, "L")
            try:
                profile = _read_card(_frame(d, "current-car-details"))
                break
            except ValueError as retry:
                if "缺少車輛參數" not in str(retry):
                    raise
        else:
            raise
    if (
        expected
        and compact(profile["carName"]).casefold() != compact(expected).casefold()
    ):
        from .measurement_api import confirm_named_target

        if not confirm_named_target(d, profile, expected):
            raise ValueError(
                f"目標車輛不符：預期 {expected}，目前 {profile['carName']}"
            )
    d.log(
        f"已確認目前車輛 {profile['carName']} {profile['carClass']}{profile['performanceIndex']}"
    )
    d.observed(profile.copy())
    _keys(d, "ESC")
    # The card grid animates back to the Cars menu. Wait for its options before clicking.
    if _scene(d) != "garage":
        raise ValueError("尚未返回車輛頁")
    d.click(96, 310)
    if _scene(d) != "upgrades":
        raise ValueError("未進入升級套件")
    profile.update(_shop(d))
    d.observed(profile.copy())
    d.click(92, 337)
    d.wait(0.85)
    gear = select_tuning_tab(d, "gears")
    adj = {
        "gears": gear["gearCount"],
        "gearbox": "Full"
        if "gearing.gear1" in gear["fields"]
        else "FinalDrive"
        if "gearing.finalDrive" in gear["fields"]
        else "Fixed",
    }
    profile.update(
        mechBalance=gear["mechBalance"], aeroEfficiency=gear["aeroEfficiency"]
    )
    if profile["mechBalance"] is None or profile["aeroEfficiency"] is None:
        raise ValueError("平衡或空力效率無法辨識")
    aero_page = select_tuning_tab(d, "aero")
    aero = aero_page["fields"]
    present = [axle for axle in ("front", "rear") if "aero_downforce_" + axle in aero]
    adj["aero"] = (
        "Adjustable"
        if len(present) == 2
        else present[0].title() + " Only"
        if present
        else "Fixed"
    )
    for axle in ("front", "rear"):
        key = "aero_downforce_" + axle
        profile[key] = None
        if key in aero:
            factor = {"lb": 0.45359237, "kg": 1, "kgf": 1}.get(aero_page["units"][key])
            if factor is None:
                raise ValueError(f"無法確認{axle}軸下壓力單位")
            profile[key] = aero[key] * factor
    for tab, key in (("brakes", "brakes"), ("diff", "diff")):
        adj[key] = "Adjustable" if select_tuning_tab(d, tab)["fields"] else "Fixed"
    modified = False
    try:
        arb = select_tuning_tab(d, "arb")
        if arb["fields"]:
            modified = True
            _bounds(d, "arb", profile, arb)
        adj["arb"] = "Adjustable" if arb["fields"] else "Fixed"
        springs = select_tuning_tab(d, "springs")
        if springs["fields"]:
            modified = True
            _bounds(d, "springs", profile, springs)
        adj["suspension"] = (
            "Race"
            if all(k in springs["fields"] for k in ("spring.front", "spring.rear"))
            else "Fixed"
        )
    finally:
        if modified:
            _discard(d)
            d.click(92, 337)
            d.wait(0.5)
    profile["adjustability"] = adj
    profile.update(
        aeroInputVersion="optional/v1",
        aeroBalance=gear["aeroBalance"] if present else None,
    )
    d.observed(profile.copy())
    return profile
