"""Recognize installed upgrade parts, wheel dimensions and engine categories."""

import re

from .vision import DESCRIPTION, LABEL, Raster, compact, ocr_regions, selected_tile


def menu_title(text):
    # The left edge of the HUD sometimes produces punctuation on a bright backdrop.
    # Internal letters, digits and directional words remain exact.
    return re.sub(r"^[\W_]+|[\W_]+$", "", compact(text))


def shop_labels(path):
    regions = {
        "heading": ((43, 55, 208, 92), "zh-Hant-TW", "light"),
        "item": ((49, 326, 260, 353), "zh-Hant-TW", ""),
        "item_alt": ((47, 320, 279, 355), "zh-Hant-TW", ""),
        "description": (DESCRIPTION, "zh-Hant-TW", ""),
    }
    text = ocr_regions(path, regions, single_line=("heading", "item", "item_alt"))
    data = {key: compact(value) for key, value in text.items()}
    data["heading"] = menu_title(data["heading"])
    data["item"] = menu_title(data["item"]) or menu_title(data["item_alt"])
    return data


def tire_size(text):
    match = re.fullmatch(
        r"(\d{3})/(\d{2,3})(?:Z?R)(\d{2}(?:\.\d)?)", compact(text).upper()
    )
    if match:
        width, aspect, rim = float(match[1]), float(match[2]), float(match[3])
        if 80 <= width <= 550 and 10 <= aspect <= 100 and 8 <= rim <= 32:
            return int(width), int(aspect), rim
    return None


def read_part(path):
    with Raster(path) as im:
        tile = selected_tile(im)
    if not tile:
        raise ValueError("未能確認已選取的改裝零件")
    x, y = tile
    boxes = {
        "page": ((43, 55, 208, 90), "zh-Hant-TW", "light"),
        "badge": ((x + 2, y + 3, x + 80, y + 26), "zh-Hant-TW", ""),
        "label": (LABEL, "zh-Hant-TW", ""),
        "size": ((x + 2, y + 44, x + 81, y + 79), "en-US", ""),
        "size2": ((x + 2, y + 57, x + 79, y + 79), "zh-Hant-TW", ""),
        "size3": ((x + 2, y + 57, x + 79, y + 79), "en-US", "dark"),
    }
    # Detection isolates the small badge from its tile. On the recorded tire
    # screens, rec-only on the whole badge crop changed 裝 to simplified 装.
    text = ocr_regions(
        path, boxes, single_line=("page", "label", "size", "size2", "size3")
    )
    data = {k: compact(v) for k, v in text.items()}
    # PP-OCR can emit the simplified glyph for this exact installed-state label.
    # Keep this alias local; never normalize digits or accept the owned-state label.
    if not any(label in data["badge"] for label in ("已安裝", "已安装")):
        raise ValueError(f"零件缺少已安裝標誌 {data}")
    return data


def read_tire_size(path, axle):
    data = read_part(path)
    prefix = {"front": "前", "rear": "後"}[axle]
    if menu_title(data["page"]) not in (prefix + "輪胎寬", prefix + "輪圈尺寸"):
        raise ValueError(f"輪胎頁面不符 {data['page']}")
    values = {size for k in ("size", "size2", "size3") if (size := tire_size(data[k]))}
    if len(values) != 1:
        raise ValueError(f"輪胎尺寸不明或辨識有歧義 {data}")
    return next(iter(values))


def compound(data):
    if "踏面膠料" not in data["page"]:
        raise ValueError(f"胎料頁面不符 {data}")
    for label, value in (
        ("半熱熔", "Semi-Slick"),
        ("半光頭", "Semi-Slick"),
        ("半光面", "Semi-Slick"),
        ("光頭", "Slick"),
        ("光面", "Slick"),
        ("拉力", "Rally"),
        ("雪", "Snow"),
        ("甩尾", "Drift"),
        ("直線加速", "Drag"),
        ("越野", "Off-Road"),
        ("跑車", "Sport"),
        ("街車", "Street"),
        ("街道", "Street"),
        ("原廠", "Stock"),
    ):
        if label in data["label"]:
            return value
    raise ValueError(f"胎料無法辨識 {data['label']}")


def forced_induction(label):
    if re.fullmatch(r"(?:單|雙)?渦輪(?:增壓(?:器|系統)?)?", label):
        return "TwinTurbo" if "雙" in label else "Turbo"
    if "機械增壓" in label or "離心式增壓" in label or "容積式增壓" in label:
        return "Supercharger"
    return None


def icon(im, col, row):
    # Downsample only the monochrome illustration. Exclude category names and the selection border.
    x, y = 85 + 77.5 * col, 132 + 77.5 * row
    return sum(
        1 << (j * 20 + i)
        for j in range(20)
        for i in range(20)
        if max(im.pixel(x - 32.5 + (i + 0.5) * 3.25, y - 32.5 + (j + 0.5) * 3.25)) < 164
    )


def known_engine_layout(path, templates):
    """Match every nonempty engine tile against observed category illustrations."""
    with Raster(path) as im:
        for i, options in enumerate(templates):
            current = icon(im, i % 3, i // 3)
            if min((current ^ int(stored, 16)).bit_count() for stored in options) > 14:
                return False
    return True
