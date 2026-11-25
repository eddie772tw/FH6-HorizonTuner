"""Ordered OCR sessions; native PP-OCR is the default, Windows is opt-in."""

import atexit
import json
import os
import queue
import subprocess
import threading
from pathlib import Path


class OcrSession:
    def __init__(self, timeout=15):
        self.timeout = timeout
        self._lock = threading.Lock()
        self._process = None
        self._serial = 0

    def _start(self):
        self._process = subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(Path(__file__).with_name("windows_ocr.ps1")),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        self._replies = queue.Queue()

        # Capture the actual process and mailbox. A late response from a cancelled
        # request can never enter the replacement process's queue.
        def receive(stdout, replies):
            try:
                for line in stdout:
                    replies.put(line)
            finally:
                replies.put(None)

        threading.Thread(
            target=receive, args=(self._process.stdout, self._replies), daemon=True
        ).start()

    def _stop(self):
        child = self._process
        self._process = None
        if child is None:
            return
        try:
            child.stdin.close()
        except OSError:
            pass
        try:
            child.wait(timeout=0.6)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=3)
        child.stdout.close()

    def close(self):
        with self._lock:
            self._stop()

    def read(self, path, regions):
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                self._stop()
                self._start()
            self._serial += 1
            request = {
                "id": self._serial,
                "path": str(Path(path).resolve()),
                "regions": regions,
            }
            try:
                self._process.stdin.write(json.dumps(request).encode("ascii") + b"\n")
                self._process.stdin.flush()
                reply = self._replies.get(timeout=self.timeout)
                if reply is None:
                    raise RuntimeError("Windows OCR 程序已結束")
                payload = json.loads(reply.decode("utf-8-sig"))
                if payload.get("status") != "ok":
                    raise RuntimeError(f"Windows OCR: {payload.get('error')}")
                if payload.get("id") != self._serial:
                    raise RuntimeError("Windows OCR 回覆與本次截圖不符")
                if set(payload["regions"]) != {r["name"] for r in regions}:
                    raise RuntimeError("Windows OCR 回覆缺少預期欄位")
                return payload["regions"]
            except queue.Empty as exc:
                self._stop()
                raise RuntimeError("Windows OCR 等待逾時") from exc
            except (ValueError, OSError, KeyError, RuntimeError):
                self._stop()
                raise


def create_session(engine=None, runtime_dir=None):
    engine = engine or os.environ.get("FH6_OCR_ENGINE", "onnx")
    if engine == "windows":
        return OcrSession()
    if engine == "onnx":
        from .native_ocr import NativeOcrSession

        return NativeOcrSession(runtime_dir)
    raise ValueError(f"Unknown OCR engine: {engine}")


_session = create_session()
atexit.register(_session.close)
read = _session.read
close = _session.close


def prepare():
    """Validate native assets before the workflow starts sending game input."""
    if hasattr(_session, "prepare"):
        _session.prepare()
