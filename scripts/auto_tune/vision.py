"""Read a saved FH6 frame using the selected local OCR and measured 16:9 menu layout."""

import ctypes
import re
import unicodedata
from pathlib import Path

from .ocr_session import read as read_ocr
from .slider_digits import read_number

TAB_CENTERS = {
    "tyres": 210,
    "gears": 278,
    "alignment": 355,
    "arb": 432,
    "springs": 494,
    "damping": 545,
    "aero": 609,
    "brakes": 680,
    "diff": 743,
}
PAGE_ROWS = {
    "tyres": [(0, "pressure.front"), (1, "pressure.rear")],
    "alignment": [
        (0, "camber.front"),
        (1, "camber.rear"),
        (3, "toe.front"),
        (4, "toe.rear"),
        (6, "caster.front"),
    ],
    "arb": [(0, "arb.front"), (1, "arb.rear")],
    "springs": [
        (0, "spring.front"),
        (1, "spring.rear"),
        (3, "height.front"),
        (4, "height.rear"),
    ],
    "damping": [
        (0, "rebound.front"),
        (1, "rebound.rear"),
        (3, "bump.front"),
        (4, "bump.rear"),
    ],
    "aero": [(0, "aero_downforce_front"), (1, "aero_downforce_rear")],
    "brakes": [(0, "brake.balance"), (2, "brake.pressure")],
}
HEADER = (80, 20, 415, 40)
TITLE = (47, 55, 278, 82)
LABEL = (49, 320, 278, 354)
DESCRIPTION = (52, 356, 275, 383)


def compact(value):
    return (
        re.sub(r"\s", "", unicodedata.normalize("NFKC", value))
        .replace("−", "-")
        .replace("–", "-")
    )


def ocr_regions(path, regions, *, single_line=()):
    """Batch all crops on one immutable frame. Coordinates refer to a 960x540 viewport."""
    requests = []
    for name, (box, language, mode) in regions.items():
        left, top, right, bottom = box
        request = dict(
            name=name,
            language=language,
            only_rec=name in single_line,
            bounds=dict(
                x=left / 960,
                y=top / 540,
                width=(right - left) / 960,
                height=(bottom - top) / 540,
            ),
        )
        if mode:
            request.update(mode=mode, scale=2)
        requests.append(request)
    results = read_ocr(path, requests)
    values = {}
    for name, region in results.items():
        if region.get("status") != "ok":
            raise RuntimeError(f"OCR {name}: {region.get('error')}")
        values[name] = region["text"]
    return values


def ocr(path, boxes, language="zh-Hant-TW", *, single_line=()):
    return ocr_regions(
        path,
        {name: (box, language, "") for name, box in boxes.items()},
        single_line=single_line,
    )


class Raster:
    """Read only screen landmarks from one captured PNG through GDI+."""

    def __init__(self, path):
        self.path = str(Path(path).resolve())

    def __enter__(self):
        class Startup(ctypes.Structure):
            _fields_ = [
                ("version", ctypes.c_uint32),
                ("callback", ctypes.c_void_p),
                ("background", ctypes.c_int32),
                ("codecs", ctypes.c_int32),
            ]

        self.api = ctypes.windll.gdiplus
        self.token = ctypes.c_size_t()
        self.bitmap = ctypes.c_void_p()
        if self.api.GdiplusStartup(
            ctypes.byref(self.token), ctypes.byref(Startup(1)), None
        ):
            raise RuntimeError("GDI+ initialization failed")
        try:
            if self.api.GdipCreateBitmapFromFile(
                ctypes.c_wchar_p(self.path), ctypes.byref(self.bitmap)
            ):
                raise ValueError("Invalid capture")
            width, height = ctypes.c_uint(), ctypes.c_uint()
            self.api.GdipGetImageWidth(self.bitmap, ctypes.byref(width))
            self.api.GdipGetImageHeight(self.bitmap, ctypes.byref(height))
            self.w, self.h = width.value, height.value
            if self.w < 960 or self.h < 540 or abs(self.w / self.h - 16 / 9) > 0.015:
                raise ValueError("Unsupported capture aspect ratio or size")

            class Lock(ctypes.Structure):
                _fields_ = [
                    ("width", ctypes.c_uint),
                    ("height", ctypes.c_uint),
                    ("stride", ctypes.c_int),
                    ("format", ctypes.c_int),
                    ("scan", ctypes.c_void_p),
                    ("reserved", ctypes.c_size_t),
                ]

            rect = (ctypes.c_int * 4)(0, 0, self.w, self.h)
            lock = Lock()
            if self.api.GdipBitmapLockBits(
                self.bitmap, ctypes.byref(rect), 1, 0x26200A, ctypes.byref(lock)
            ):
                raise RuntimeError("Unable to read frame")
            try:
                if lock.stride < 4 * self.w:
                    raise ValueError("Unsupported bitmap stride")
                self.stride = lock.stride
                self.data = ctypes.string_at(lock.scan, lock.stride * self.h)
            finally:
                self.api.GdipBitmapUnlockBits(self.bitmap, ctypes.byref(lock))
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *args):
        if self.bitmap:
            self.api.GdipDisposeImage(self.bitmap)
        self.api.GdiplusShutdown(self.token)

    def pixel(self, x, y):
        i = round(y * self.h / 540) * self.stride + 4 * round(x * self.w / 960)
        b, g, r = self.data[i : i + 3]
        return r, g, b


def lime(rgb):
    r, g, b = rgb
    return g > 166 and r > 85 and g > r and b < 110


def pink(rgb):
    r, g, b = rgb
    return r > 165 and g < 125 and 50 < b < 210 and r > b + 22


def grey(rgb):
    return max(rgb) - min(rgb) < 30 and 90 < min(rgb) < 225


def selected_tile(im, shop=True):
    x0, y0, dx, dy, cols, rows = (
        (46, 86, 77.5, 77.5, 3, 3) if shop else (202, 104, 169.6, 125, 4, 3)
    )
    for row in range(rows):
        for col in range(cols):
            x, y = x0 + col * dx, y0 + row * dy
            if (
                max(
                    sum(lime(im.pixel(x + i, y + offset)) for i in range(10, 65, 4))
                    for offset in range(-3, 5)
                )
                >= 12
                and max(
                    sum(lime(im.pixel(x + offset, y + i)) for i in range(10, 65, 4))
                    for offset in range(-3, 5)
                )
                >= 12
            ):
                return x, y
    return None


def identity(raw):
    match = re.search(r"\b(?:19|20)\d\d\s+.+", raw)
    if not match:
        raise ValueError(f"Vehicle name unreadable: {raw!r}")
    return " ".join(match.group().strip().split())


def _number(raw):
    text = compact(raw).replace("。", ".").replace("·", ".")
    text = re.sub(r"(?<=\d),(?=\d{3}(?:\D|$))", "", text)
    m = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)(?:[%°º˚]|[oO])?", text)
    return float(m[1]) if m else None


def _majority_value(narrow, wide, glyph):
    """Prefer agreeing OCR crops; the glyph is a third vote, never a veto."""
    if narrow is not None and narrow == wide:
        return narrow
    if glyph is not None and glyph in (narrow, wide):
        return glyph
    return None


def _rail(im, y):
    # A grey/pink uninterrupted horizontal track differentiates rows from the green headers.
    back = im.pixel(400, y)
    selected = max(back) < 8 and any(
        lime(im.pixel(x, y)) for x in (258, 258.5, 259, 259.5, 260)
    )
    if not selected and not (min(back) > 226 and max(back) - min(back) < 18):
        return None
    samples = [im.pixel(x, y) for x in range(519, 659, 2)]
    if sum(pink(p) or grey(p) for p in samples) < 0.71 * len(samples):
        return None
    columns = [
        x
        for x in range(511, 666)
        if any(pink(im.pixel(x, y + dy)) for dy in (-3, -2, 2, 3))
    ]
    locked = not columns

    return dict(
        y=y,
        xMin=517,
        xMax=659,
        locked=locked,
        selected=selected,
        thumbX=(min(columns) + max(columns)) / 2 if columns else None,
    )


def _unit(key, raw):
    raw = compact(raw).lower()
    if key.startswith("pressure."):
        matches = [u for u in ("psi", "bar", "kpa") if u in raw]
    elif key.startswith("spring."):
        matches = [u for u in ("lb/in", "kgf/mm", "n/mm") if u in raw]
    elif key.startswith("height."):
        matches = [u for u in ("in", "cm", "mm") if raw.endswith(u)]
    elif key.startswith("aero_downforce"):
        matches = [u for u in ("lb", "kgf", "kg") if raw.endswith(u)]
    elif key.startswith(("camber.", "toe.", "caster.")):
        return "deg"
    elif key.startswith(("diff.", "brake.")):
        return "%"
    elif key.startswith("gearing."):
        return "ratio"
    else:
        return "slider"
    return matches[0] if len(matches) == 1 else None


def tuning_tabs(im):
    return [
        tab
        for tab, x in TAB_CENTERS.items()
        if any(
            lime(im.pixel(x, y)) and lime(im.pixel(x + 9, y))
            for y in (98.5, 99, 99.5, 100, 100.5, 101)
        )
    ]


def read_tuning_page(path):
    with Raster(path) as im:
        tabs = tuning_tabs(im)
        if len(tabs) != 1:
            raise ValueError(f"Active tuning tab unreadable ({tabs})")
        tab = tabs[0]
        rails = {}
        for i in range(12):
            for delta in (0, 0.5, -0.5, 1, -1):
                rail = _rail(im, 144.5 + 27 * i + delta)
                if rail:
                    if not rail["locked"]:
                        rail["digits"] = read_number(im, rail["y"], rail["selected"])
                    rails[i] = rail
                    break
    layout = PAGE_ROWS.get(tab)
    if tab == "gears":
        layout = [
            (i, "gearing.finalDrive" if i == 0 else f"gearing.gear{i}")
            for i in range(len(rails))
        ]
    elif tab == "diff":
        # One axle pair on FWD/RWD. Read its green section title before assigning an axle.
        layout = []
        for start in (0, 3):
            if start in rails:
                layout.extend(
                    [
                        (start, f"diff.axle{start}.acceleration"),
                        (start + 1, f"diff.axle{start}.deceleration"),
                    ]
                )
        if 6 in rails:
            layout.append((6, "diff.center"))
    if not layout or {i for i, _ in layout} != set(rails):
        raise ValueError(f"Unrecognized {tab} slider layout: {list(rails)}")
    requests = {
        "name": (HEADER, "en-US", ""),
        "unit": ((612, 105, 698, 129), "en-US", ""),
        "unit_alt": ((612, 105, 698, 129), "zh-Hant-TW", "light"),
        "heightunit": ((611, 185, 696, 208), "en-US", ""),
        "heightunit_alt": ((611, 185, 696, 208), "zh-Hant-TW", "light"),
        "balance": ((204, 406, 252, 431), "en-US", ""),
        "aerobalance": ((204, 432, 252, 456), "en-US", ""),
        "efficiency": ((204, 457, 252, 482), "en-US", ""),
    }
    for i, _ in layout:
        if tab == "diff" and i in (0, 3):
            requests[f"axle{i}"] = (
                (267, 105 + 27 * i, 360, 129 + 27 * i),
                "zh-Hant-TW",
                "",
            )
        if not rails[i]["locked"]:
            y = rails[i]["y"]
            requests[f"r{i}"] = ((664, y - 11, 698, y + 11), "en-US", "")
            requests[f"wide{i}"] = ((659, y - 12, 699, y + 12), "en-US", "")
    text = ocr_regions(path, requests, single_line=requests)
    car = identity(text["name"])
    fields, units, rows, selected = {}, {}, {}, None
    warnings = []
    for i, key in layout:
        if ".axle" in key:
            n = i // 3 * 3
            label = compact(text[f"axle{n}"])
            axle = "front" if "前" in label else "rear" if "後" in label else None
            if not axle:
                raise ValueError(f"Unknown differential axle: {label}")
            key = key.replace(f"axle{n}", axle)
        row = rails[i]
        rows[key] = row
        if row["selected"]:
            selected = key
        if row["locked"]:
            continue
        narrow, wide = (_number(text[k]) for k in (f"r{i}", f"wide{i}"))
        glyph = _number(row.get("digits") or "")
        value = _majority_value(narrow, wide, glyph)
        if value is None:
            raise ValueError(f"回讀無多數決 {key}: OCR {narrow} / {wide}，字形 {glyph}")
        if any(v is not None and v != value for v in (narrow, wide, glyph)):
            warnings.append(
                f"回讀多數決 {key}：採用 {value:g}（OCR {narrow} / {wide}，字形 {glyph}）"
            )
        fields[key] = value
        crop = "heightunit" if key.startswith("height.") else "unit"
        candidates = {_unit(key, text[name]) for name in (crop, crop + "_alt")} - {None}
        units[key] = candidates.pop() if len(candidates) == 1 else None
    return dict(
        page="tuning." + tab,
        car=car,
        fields=fields,
        rows=rows,
        selected=selected,
        units=units,
        warnings=warnings,
        gearCount=len(rails) - 1 if tab == "gears" else None,
        mechBalance=_number(text["balance"]),
        aeroBalance=_number(text["aerobalance"]),
        aeroEfficiency=_number(text["efficiency"]),
    )


def select_tuning_tab(device, tab, car=None):
    """Click and bind a visible tab. Only retry input after recognizing another tuning page."""
    expected_name = compact(car).casefold() if car else None
    for _ in range(2):
        device.click(TAB_CENTERS[tab], 91)
        device.wait(0.45)
        for attempt in range(2):
            path = device.capture(tab)
            try:
                page = read_tuning_page(path)
                break
            except ValueError:
                if attempt:
                    raise
                device.wait(0.4)
        if expected_name and compact(page["car"]).casefold() != expected_name:
            raise ValueError(f"切換調校頁時車輛不同 {page['car']}")
        if page["page"] == "tuning." + tab:
            page["source"] = path.name
            for warning in page["warnings"]:
                device.log(warning)
            return page
    raise ValueError(f"切頁失敗 {page['page']}")
