"""Native CPU OCR. Models and inference stay in the DLL; no Python ML packages."""

import ctypes
import os
import re
import threading
from pathlib import Path


class NativeOcrSession:
    def __init__(self, runtime_dir=None, threads=2):
        self.runtime_dir = Path(
            runtime_dir
            or os.environ.get("FH6_OCR_RUNTIME", Path(__file__).with_name("native"))
        ).resolve()
        self.threads = threads
        self._lock = threading.Lock()
        self._context = None
        self._dll = None
        self._search = None

    def _start(self):
        required = (
            "fh6_ocr.dll",
            "onnxruntime.dll",
            "det.onnx",
            "rec.onnx",
            "keys.txt",
        )
        missing = [name for name in required if not (self.runtime_dir / name).is_file()]
        if missing:
            raise RuntimeError(
                f"原生 OCR 資源不完整：{', '.join(missing)}。"
                f"請重新啟動以還原內附資源，或重新下載完整的發行版本；"
                f"目前目錄：{self.runtime_dir}"
            )
        self._search = os.add_dll_directory(str(self.runtime_dir))
        try:
            self._dll = ctypes.CDLL(str(self.runtime_dir / "fh6_ocr.dll"))
            pointer, size, char = ctypes.c_void_p, ctypes.c_size_t, ctypes.c_char_p
            self._dll.fh6_ocr_create.argtypes = [
                ctypes.c_wchar_p,
                ctypes.c_int,
                char,
                size,
            ]
            self._dll.fh6_ocr_create.restype = pointer
            self._dll.fh6_ocr_destroy.argtypes = [pointer]
            self._dll.fh6_ocr_destroy.restype = None
            self._dll.fh6_ocr_open.argtypes = [pointer, ctypes.c_wchar_p, char, size]
            self._dll.fh6_ocr_open.restype = ctypes.c_int
            self._dll.fh6_ocr_read.argtypes = (
                [pointer]
                + [ctypes.c_double] * 4
                + [ctypes.c_int] * 5
                + [char, size, ctypes.POINTER(ctypes.c_float), char, size]
            )
            self._dll.fh6_ocr_read.restype = ctypes.c_int
            error = ctypes.create_string_buffer(4096)
            self._context = self._dll.fh6_ocr_create(
                str(self.runtime_dir), self.threads, error, len(error)
            )
            if not self._context:
                raise RuntimeError(error.value.decode("utf8", "replace"))
        except Exception:
            self._search.close()
            self._search = None
            raise

    def prepare(self):
        """Load and validate models before the worker sends any game input."""
        with self._lock:
            if not self._context:
                self._start()

    def close(self):
        with self._lock:
            if self._context:
                self._dll.fh6_ocr_destroy(self._context)
                self._context = None
            if self._search:
                self._search.close()
                self._search = None

    def read(self, path, regions):
        if len(regions) > 64:
            raise ValueError("Too many OCR regions")
        names = [r["name"] for r in regions]
        if len(set(names)) != len(names) or any(
            not re.fullmatch(r"[a-z][a-z0-9_]{0,40}", n) for n in names
        ):
            raise ValueError("Invalid or duplicate OCR region name")
        with self._lock:
            if not self._context:
                self._start()
            error = ctypes.create_string_buffer(4096)
            if self._dll.fh6_ocr_open(
                self._context, str(Path(path).resolve()), error, len(error)
            ):
                raise RuntimeError(error.value.decode("utf8", "replace"))
            results = {}
            for region in regions:
                bounds = region["bounds"]
                output = ctypes.create_string_buffer(65536)
                confidence = ctypes.c_float()
                mode = {"light": 1, "dark": 2, "": 0}.get(region.get("mode", ""))
                if mode is None:
                    raise ValueError("Invalid OCR mask mode")
                status = self._dll.fh6_ocr_read(
                    self._context,
                    *[bounds[k] for k in ("x", "y", "width", "height")],
                    mode,
                    region.get("scale", 2),
                    region.get("padding", 24),
                    region.get("threshold", 155),
                    bool(region.get("only_rec", False)),
                    output,
                    len(output),
                    ctypes.byref(confidence),
                    error,
                    len(error),
                )
                if status:
                    results[region["name"]] = {
                        "status": "unknown",
                        "text": "",
                        "error": error.value.decode("utf8", "replace"),
                    }
                else:
                    results[region["name"]] = {
                        "status": "ok",
                        "text": output.value.decode("utf8"),
                        "confidence": confidence.value,
                    }
            return results
