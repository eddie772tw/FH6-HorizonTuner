"""Foreground-only FH6 input and game screenshots for a single desktop run."""

import ctypes
import os
import re
import time
from ctypes import wintypes

from . import win32_capture as native


def publish_snapshot(source, destination):
    """Allow Windows readers of the previous snapshot time to release their handle."""
    deadline = time.monotonic() + 2
    while True:
        try:
            os.replace(source, destination)
            return
        except PermissionError as exc:
            if (
                getattr(exc, "winerror", None) not in (5, 32, 33)
                or time.monotonic() >= deadline
            ):
                raise
            time.sleep(0.025)


SCANS = {
    "ENTER": 0x1C,
    "ESC": 0x01,
    "UP": 0x48,
    "DOWN": 0x50,
    "LEFT": 0x4B,
    "RIGHT": 0x4D,
    "W": 0x11,
    "A": 0x1E,
    "S": 0x1F,
    "D": 0x20,
    "E": 0x12,
    "Q": 0x10,
    "M": 0x32,
    "X": 0x2D,
    "Y": 0x15,
    "L": 0x26,
    "SPACE": 0x39,
    "TAB": 0x0F,
    "PAGEUP": 0x49,
    "PAGEDOWN": 0x51,
    "BACKSPACE": 0x0E,
}
EXTENDED = {"UP", "DOWN", "LEFT", "RIGHT", "PAGEUP", "PAGEDOWN"}


class Stopped(Exception):
    pass


class Device:
    def __init__(
        self, state, port, goal, season, expected_car_name=None, parent_pid=None
    ):
        self.state = state
        self.output = state.output
        self.port = port
        self.goal = goal
        self.season = season
        self.held = set()
        self.expected_car_name = expected_car_name
        self.parent = None
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [
            wintypes.DWORD,
            wintypes.BOOL,
            wintypes.DWORD,
        ]
        self.kernel.OpenProcess.restype = wintypes.HANDLE
        self.kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        if parent_pid:
            self.parent = self.kernel.OpenProcess(0x100000, False, parent_pid)
            if not self.parent:
                raise Stopped("控制器的桌面服務已結束")
        self.increments = {}
        self.serial = 0
        self.car_id = None
        matches = [w for w in native.discover_game() if w["title"] == "Forza Horizon 6"]
        if len(matches) != 1:
            raise RuntimeError("請先啟動 FH6，進入目標車輛的嘉年華車庫。")
        self.hwnd = matches[0]["hwnd"]
        self.user = native._api()[0]
        self.user.SetThreadDpiAwarenessContext(-4)
        self.user.WindowFromPoint.argtypes = [wintypes.POINT]
        self.user.WindowFromPoint.restype = wintypes.HWND
        native.focus_window(self.hwnd)
        time.sleep(0.25)
        self.guard()

    def guard(self):
        if self.parent and self.kernel.WaitForSingleObject(self.parent, 0) != 258:
            raise Stopped("控制器的桌面服務已結束")
        if (self.output / "STOP").exists():
            raise Stopped("已停止操作")
        native._require_foreground_game(self.hwnd)

    def log(self, msg):
        self.state.log(msg)

    def observed(self, values):
        self.state.values("observed", values)

    def ocr(self, path, boxes, language="zh-Hant-TW"):
        from .vision import ocr

        return ocr(path, boxes, language)

    def wait(self, seconds):
        end = time.monotonic() + seconds
        while True:
            self.guard()
            left = end - time.monotonic()
            if left <= 0:
                return
            time.sleep(min(left, 0.1))

    def capture(self, label="screen"):
        self.guard()
        w, h, bgra = native._capture_pixels(self.hwnd)
        if abs(w / h - 16 / 9) > 0.015 or w < 1280:
            raise RuntimeError("此辨識配置需要至少 1280 像素寬的 16:9 遊戲畫面")
        self.guard()
        png = native._png(w, h, bgra)
        self.serial += 1
        tag = re.sub(r"[^A-Za-z0-9_-]", "_", label)[:50]
        path = self.output / f"{self.serial:04d}-{tag}.png"
        path.write_bytes(png)
        tmp = self.output / "latest.tmp"
        tmp.write_bytes(png)
        publish_snapshot(tmp, self.output / "latest.png")
        return path

    def _point(self, x, y):
        self.guard()
        rect = wintypes.RECT()
        if not self.user.GetClientRect(self.hwnd, ctypes.byref(rect)) or not (
            0 <= x < 960 and 0 <= y < 540
        ):
            raise ValueError("滑鼠目標超出遊戲範圍")
        point = wintypes.POINT(
            round(x * rect.right / 960), round(y * rect.bottom / 540)
        )
        if (
            not self.user.ClientToScreen(self.hwnd, ctypes.byref(point))
            or self.user.WindowFromPoint(point) != self.hwnd
        ):
            raise RuntimeError("遊戲畫面被其他視窗遮住")
        return point

    def hover(self, x, y):
        p = self._point(x, y)
        if not self.user.SetCursorPos(p.x, p.y):
            raise ctypes.WinError()
        self.wait(0.065)

    def click(self, x, y):
        self.hover(x, y)
        self._point(x, y)
        try:
            self.user.mouse_event(2, 0, 0, 0, 0)
            self.wait(0.065)
        finally:
            self.user.mouse_event(4, 0, 0, 0, 0)
        self.wait(0.08)

    def drag(self, x1, y1, x2, y2):
        self.hover(x1, y1)
        try:
            self.user.mouse_event(2, 0, 0, 0, 0)
            self.wait(0.075)
            for i in range(1, 11):
                point = self._point(x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10)
                self.user.SetCursorPos(point.x, point.y)
                self.wait(0.017)
        finally:
            self.user.mouse_event(4, 0, 0, 0, 0)
        self.wait(0.15)

    def zoom(self, notches):
        if abs(notches) > 8:
            raise ValueError("Invalid zoom")
        for _ in range(abs(notches)):
            self.guard()
            self.user.mouse_event(0x800, 0, 0, 120 if notches > 0 else -120, 0)
            self.wait(0.13)

    def hold(self, key):
        self.guard()
        if key not in self.held:
            native._send_input(native._event(SCANS[key], key in EXTENDED))
            self.held.add(key)

    def release(self, key):
        if key in self.held:
            native._send_input(native._event(SCANS[key], key in EXTENDED, key_up=True))
            self.held.remove(key)

    def tap(self, key, count=1):
        if not 0 <= count <= 300 or key in self.held:
            raise ValueError("Invalid input batch")
        for _ in range(count):
            try:
                self.hold(key)
                self.wait(0.065)
            finally:
                self.release(key)
            self.wait(0.075)

    def release_all(self):
        for key in tuple(self.held):
            self.release(key)

    def close(self):
        try:
            self.release_all()
        finally:
            if self.parent:
                self.kernel.CloseHandle(self.parent)
                self.parent = None
