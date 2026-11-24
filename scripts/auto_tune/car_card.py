"""Read the five labelled rows on the Traditional Chinese garage specification card."""

import re
from itertools import groupby

from .vision import Raster, compact, ocr_regions

NUMBER = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
# Each row has a right-aligned value. Units are confirmed from the current image
# before applying the same conversions used by the manual tuning workflow.
STATS = {
    "maxHp": ("馬力", {"hp": 1, "kw": 1 / 0.7456998715822702, "ps": 0.986320070619}),
    "maxTorque": (
        "扭力",
        {"ft·lb": 1.3558179483314, "lb·ft": 1.3558179483314, "nm": 1},
    ),
    "weight": ("車重", {"lb": 0.45359237, "kg": 1}),
    "weight_distribution": ("前端重量比", {"%": 1}),
    "displacementLiters": ("排氣量", {"l": 1, "cc": 0.001, "cm3": 0.001}),
}


def _unit(raw):
    unit = compact(raw).lower()
    if re.fullmatch(r"ft[•·.\-]?lb", unit):
        return "ft·lb"
    if re.fullmatch(r"lb[•·.\-]?ft", unit):
        return "lb·ft"
    if re.fullmatch(r"n[•·.\-]?m", unit):
        return "nm"
    return unit


def _solid_stem(ink):
    """The litre 'l' is a rectangular stem. A numeral 1 has a wide flag."""
    if not ink:
        return False
    width = max(x for x, _ in ink) - min(x for x, _ in ink) + 1
    height = max(y for _, y in ink) - min(y for _, y in ink) + 1
    return (
        height >= 7
        and 0.07 <= width / height <= 0.23
        and len(ink) >= 0.91 * width * height
    )


def _value_crops(image, index, key):
    # Work in native pixels so that spaces and decimal points survive downscaling.
    # Ignore the wide empty gap between the Chinese label and the right-aligned text.
    scale = image.w / 960
    center = 256 + index * 22.5
    xs = range(round(126 * scale), round(198 * scale))
    ys = range(
        round((center - 7.5) * image.h / 540), round((center + 7.5) * image.h / 540)
    )
    ink = {
        (x, y)
        for y in ys
        for x in xs
        if min(image.data[y * image.stride + x * 4 : y * image.stride + x * 4 + 3])
        > 155
    }
    occupied = {x for x, _ in ink}
    runs = []
    for active, columns in groupby(xs, key=occupied.__contains__):
        if active:
            columns = list(columns)
            if runs and columns[0] - runs[-1][1] > 7 * scale:
                runs.clear()
            runs.append((columns[0], columns[-1] + 1))
    if len(runs) < 2:
        raise ValueError(f"缺少車輛參數 {key} 的數字及單位")
    gaps = [right[0] - left[1] for left, right in zip(runs, runs[1:])]
    # Percent touches the number typographically but is one connected column run.
    # Other FH6 card units are separated from the magnitude by a word space.
    split = len(gaps) - 1 if key == "weight_distribution" else gaps.index(max(gaps))
    boundary = (runs[split][1] + runs[split + 1][0]) / (2 * scale)
    number_box = (runs[0][0] / scale - 2, center - 8, boundary, center + 8)
    unit_box = (boundary, center - 8, 196, center + 8)
    stem = (
        key == "displacementLiters"
        and gaps[split] >= 2.5 * scale
        and _solid_stem({point for point in ink if point[0] >= runs[split + 1][0]})
    )
    return number_box, unit_box, stem


def _read_value(key, row, number, unit, stem):
    label, factors = STATS[key]
    row = compact(row)
    if not row.startswith(label):
        raise ValueError(f"缺少車輛參數 {label} 的列標籤 {row!r}")
    split_number = compact(number)
    split_number = split_number if re.fullmatch(NUMBER, split_number) else None
    split_unit = _unit(unit)
    if key == "displacementLiters" and split_unit in ("", "1", "|", "i", "l"):
        # Independent optical evidence from the isolated unit glyph and its gap.
        # The digit '1' attached to a magnitude or drawn with a flag fails this check.
        split_unit = "l" if stem else None
    else:
        split_unit = split_unit if split_unit in factors else None
    # A bad unit suffix must not hide a contradictory magnitude. For litres the
    # recognizer can append a stem as '1' to the number; accept only the exact
    # isolated magnitude followed by that one optically verified unit glyph.
    body = row[len(label) :]
    printed = body.replace(",", "")
    prefix = re.match(NUMBER, body)
    magnitude = prefix[0].replace(",", "") if prefix else None
    whole_unit = _unit(body[prefix.end() :]) if prefix else None
    if key == "displacementLiters" and whole_unit == "l" and not stem:
        raise ValueError(f"車卡 {label} 缺少獨立單位字形證據")
    if split_number and prefix:
        expected = split_number.replace(",", "")
        stem_suffix = (
            key == "displacementLiters"
            and stem
            and printed in {expected + suffix for suffix in ("1", "I", "i", "|", "l")}
        )
        if magnitude != expected and not stem_suffix:
            raise ValueError(f"車卡 {label} 數值讀回不一致 {number!r} / {row!r}")
    if prefix and whole_unit in factors:
        if split_number and split_number.replace(",", "") != magnitude:
            raise ValueError(f"車卡 {label} 數值讀回不一致 {number!r} / {row!r}")
        if split_unit and split_unit != whole_unit:
            raise ValueError(f"車卡 {label} 單位讀回不一致 {unit!r} / {row!r}")
        return split_number or prefix[0], split_unit or whole_unit
    if split_number and split_unit:
        return split_number, split_unit
    raise ValueError(
        f"缺少車輛參數 {label} 的有效數字或單位 {number!r} {unit!r} / {row!r}"
    )


def read_card_stats(path):
    """Return each magnitude as printed and its unit, independently of car identity."""
    requests, stems = {}, {}
    with Raster(path) as image:
        for index, key in enumerate(STATS):
            number, unit, stems[key] = _value_crops(image, index, key)
            y = 256 + index * 22.5
            requests[f"row{index}"] = ((51, y - 10, 199, y + 10), "zh-Hant-TW", "")
            requests[f"num{index}"] = (number, "en-US", "")
            requests[f"unit{index}"] = (unit, "en-US", "")
    text = ocr_regions(path, requests, single_line=requests)
    return {
        key: _read_value(
            key, text[f"row{i}"], text[f"num{i}"], text[f"unit{i}"], stems[key]
        )
        for i, key in enumerate(STATS)
    }


def canonical_stats(readings):
    return {
        key: float(number.replace(",", "")) * STATS[key][1][unit]
        for key, (number, unit) in readings.items()
    }
