"""Win32 capture and keyboard primitives shared by the foreground game worker."""

INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 1
KEYEVENTF_KEYUP = 2
KEYEVENTF_SCANCODE = 8


import ctypes
import struct
import sys
import zlib
from ctypes import wintypes
from functools import lru_cache
from pathlib import Path

GAME_EXE = "forzahorizon6.exe"


def _windows_only():
    if sys.platform != "win32":
        raise RuntimeError("this operation requires Windows")


@lru_cache(maxsize=1)
def _api():
    _windows_only()
    user = ctypes.WinDLL("user32.dll", use_last_error=True, winmode=0x800)
    kernel = ctypes.WinDLL("kernel32.dll", use_last_error=True, winmode=0x800)
    gdi = ctypes.WinDLL("gdi32.dll", use_last_error=True, winmode=0x800)
    pointer, integer = ctypes.c_void_p, ctypes.c_int
    signatures = [
        (user, "EnumWindows", [pointer, pointer], integer),
        (user, "IsWindowVisible", [pointer], integer),
        (user, "GetForegroundWindow", [], pointer),
        (user, "SetForegroundWindow", [pointer], integer),
        (
            user,
            "GetWindowThreadProcessId",
            [pointer, ctypes.POINTER(wintypes.DWORD)],
            wintypes.DWORD,
        ),
        (user, "GetWindowTextLengthW", [pointer], integer),
        (user, "GetWindowTextW", [pointer, ctypes.c_wchar_p, integer], integer),
        (user, "GetClientRect", [pointer, ctypes.POINTER(wintypes.RECT)], integer),
        (user, "ClientToScreen", [pointer, ctypes.POINTER(wintypes.POINT)], integer),
        (user, "GetDC", [pointer], pointer),
        (user, "ReleaseDC", [pointer, pointer], integer),
        (user, "SetThreadDpiAwarenessContext", [pointer], pointer),
        (kernel, "OpenProcess", [wintypes.DWORD, integer, wintypes.DWORD], pointer),
        (kernel, "CloseHandle", [pointer], integer),
        (
            kernel,
            "QueryFullProcessImageNameW",
            [pointer, wintypes.DWORD, ctypes.c_wchar_p, ctypes.POINTER(wintypes.DWORD)],
            integer,
        ),
        (gdi, "CreateCompatibleDC", [pointer], pointer),
        (gdi, "CreateCompatibleBitmap", [pointer, integer, integer], pointer),
        (gdi, "SelectObject", [pointer, pointer], pointer),
        (gdi, "DeleteObject", [pointer], integer),
        (gdi, "DeleteDC", [pointer], integer),
        (
            gdi,
            "BitBlt",
            [
                pointer,
                integer,
                integer,
                integer,
                integer,
                pointer,
                integer,
                integer,
                wintypes.DWORD,
            ],
            integer,
        ),
        (
            gdi,
            "GetDIBits",
            [
                pointer,
                pointer,
                wintypes.UINT,
                wintypes.UINT,
                pointer,
                pointer,
                wintypes.UINT,
            ],
            integer,
        ),
    ]
    for library, name, arguments, result in signatures:
        function = getattr(library, name)
        function.argtypes, function.restype = arguments, result
    return user, kernel, gdi


def _window_info(hwnd: int) -> dict | None:
    user, kernel, _ = _api()
    process_id = wintypes.DWORD()
    if not user.GetWindowThreadProcessId(hwnd, ctypes.byref(process_id)):
        return None
    process = kernel.OpenProcess(0x1000, False, process_id.value)
    if not process:
        return None
    try:
        size = wintypes.DWORD(32768)
        path = ctypes.create_unicode_buffer(size.value)
        if not kernel.QueryFullProcessImageNameW(process, 0, path, ctypes.byref(size)):
            return None
        if Path(path.value).name.casefold() != GAME_EXE:
            return None
        title = ctypes.create_unicode_buffer(user.GetWindowTextLengthW(hwnd) + 1)
        user.GetWindowTextW(hwnd, title, len(title))
        return {
            "pid": process_id.value,
            "hwnd": int(hwnd),
            "exe": path.value,
            "title": title.value,
        }
    finally:
        kernel.CloseHandle(process)


def discover_game() -> list[dict]:
    user, _, _ = _api()
    windows = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @callback_type
    def visit(hwnd, _):
        if user.IsWindowVisible(hwnd):
            info = _window_info(hwnd)
            if info:
                windows.append(info)
        return True

    if not user.EnumWindows(visit, None):
        raise ctypes.WinError(ctypes.get_last_error())
    return windows


def focus_window(hwnd: int) -> bool:
    """Make one normal foreground request; never retry or bypass Windows focus rules."""
    user, _, _ = _api()
    if not _window_info(hwnd):
        raise ValueError("window is not an FH6 game window")
    if user.GetForegroundWindow() != hwnd:
        user.SetForegroundWindow(hwnd)
    return user.GetForegroundWindow() == hwnd


def _require_foreground_game(hwnd: int) -> dict:
    user, _, _ = _api()
    info = _window_info(hwnd)
    if not info or user.GetForegroundWindow() != hwnd:
        raise RuntimeError("capture requires the specified FH6 window to be foreground")
    return info


def _capture_pixels(hwnd: int) -> tuple[int, int, bytes]:
    user, _, gdi = _api()
    previous_dpi = user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    source = memory = bitmap = selected = None
    try:
        rect = wintypes.RECT()
        if not user.GetClientRect(hwnd, ctypes.byref(rect)):
            raise ctypes.WinError(ctypes.get_last_error())
        width, height = rect.right - rect.left, rect.bottom - rect.top
        if (
            not 0 < width <= 16384
            or not 0 < height <= 16384
            or width * height > 40_000_000
        ):
            raise RuntimeError("invalid, minimized, or oversized FH6 client area")
        origin = wintypes.POINT()
        if not user.ClientToScreen(hwnd, ctypes.byref(origin)):
            raise ctypes.WinError(ctypes.get_last_error())
        source = user.GetDC(None)
        if not source:
            raise ctypes.WinError(ctypes.get_last_error())
        memory = gdi.CreateCompatibleDC(source)
        bitmap = gdi.CreateCompatibleBitmap(source, width, height)
        if not memory or not bitmap:
            raise ctypes.WinError(ctypes.get_last_error())
        selected = gdi.SelectObject(memory, bitmap)
        if not selected or selected == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        if not gdi.BitBlt(
            memory, 0, 0, width, height, source, origin.x, origin.y, 0x00CC0020
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        gdi.SelectObject(memory, selected)
        selected = None
        # BITMAPINFOHEADER, top-down 32-bit BI_RGB plus unused color entry.
        header = ctypes.create_string_buffer(
            struct.pack(
                "<IiiHHIIiiII",
                40,
                width,
                -height,
                1,
                32,
                0,
                width * height * 4,
                0,
                0,
                0,
                0,
            )
            + bytes(4)
        )
        pixels = ctypes.create_string_buffer(width * height * 4)
        if gdi.GetDIBits(memory, bitmap, 0, height, pixels, header, 0) != height:
            raise ctypes.WinError(ctypes.get_last_error())
        return width, height, pixels.raw
    finally:
        if selected and memory:
            gdi.SelectObject(memory, selected)
        if bitmap:
            gdi.DeleteObject(bitmap)
        if memory:
            gdi.DeleteDC(memory)
        if source:
            user.ReleaseDC(None, source)
        if previous_dpi:
            user.SetThreadDpiAwarenessContext(previous_dpi)


def _png(width: int, height: int, bgra: bytes) -> bytes:
    rgb = bytearray(width * height * 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = bgra[2::4], bgra[1::4], bgra[0::4]
    stride = width * 3
    raw = b"".join(
        b"\0" + rgb[row * stride : (row + 1) * stride] for row in range(height)
    )

    def chunk(name, data):
        return (
            struct.pack(">I", len(data))
            + name
            + data
            + struct.pack(">I", zlib.crc32(name + data))
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 3))
        + chunk(b"IEND", b"")
    )


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_uint16),
        ("wScan", ctypes.c_uint16),
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_int32),
        ("dy", ctypes.c_int32),
        ("mouseData", ctypes.c_uint32),
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", ctypes.c_uint32),
        ("wParamL", ctypes.c_uint16),
        ("wParamH", ctypes.c_uint16),
    ]


class _INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("data",)
    _fields_ = [("type", ctypes.c_uint32), ("data", _INPUT_UNION)]


@lru_cache(maxsize=1)
def _user32():
    if sys.platform != "win32":
        raise RuntimeError("keyboard fallback requires Windows")
    user32 = ctypes.WinDLL("user32.dll", use_last_error=True, winmode=0x800)
    user32.SendInput.argtypes = [
        ctypes.c_uint32,
        ctypes.POINTER(INPUT),
        ctypes.c_int,
    ]
    user32.SendInput.restype = ctypes.c_uint32
    user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
    user32.GetAsyncKeyState.restype = ctypes.c_int16
    return user32


def _send_input(event):
    user32 = _user32()
    ctypes.set_last_error(0)
    count = user32.SendInput(1, ctypes.byref(event), ctypes.sizeof(INPUT))
    if count != 1:
        error = ctypes.get_last_error()
        raise RuntimeError(
            f"SendInput inserted {count}/1 events (Win32 error {error}); "
            "UIPI blocking cannot be identified from this error alone"
        )
    return count


def _event(scan_code, extended, *, key_up=False):
    flags = KEYEVENTF_SCANCODE
    if extended:
        flags |= KEYEVENTF_EXTENDEDKEY
    if key_up:
        flags |= KEYEVENTF_KEYUP
    event = INPUT()
    event.type = INPUT_KEYBOARD
    event.ki = KEYBDINPUT(0, scan_code, flags, 0, 0)
    return event
