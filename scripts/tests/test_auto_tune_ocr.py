"""OCR selection, strict field comparisons and an opt-in native DLL image replay."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import benchmark_auto_tune_ocr as bench
from scripts.auto_tune.collect import _read_card
from scripts.auto_tune.native_ocr import NativeOcrSession
from scripts.auto_tune.ocr_session import OcrSession, create_session
from scripts.auto_tune.shop import read_tire_size
from scripts.auto_tune.vision import read_tuning_page


class OcrContract(unittest.TestCase):
    def test_backend_selection(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsInstance(create_session(runtime_dir="."), NativeOcrSession)
        with patch.dict(os.environ, {"FH6_OCR_ENGINE": "onnx"}):
            self.assertIsInstance(create_session(runtime_dir="."), NativeOcrSession)
            self.assertIsInstance(create_session("windows"), OcrSession)
        with self.assertRaises(ValueError):
            create_session("unknown")

    def test_missing_runtime_stops_before_loading(self):
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            session = NativeOcrSession(directory)
            with self.assertRaisesRegex(RuntimeError, "fh6_ocr.dll.*onnxruntime.dll"):
                session.prepare()
            session.close()

    def test_duplicate_names_rejected_before_loading(self):
        session = NativeOcrSession("unused")
        with self.assertRaises(ValueError):
            session.read("unused.png", [{"name": "car"}, {"name": "car"}])
        session.close()

    def test_single_line_and_multiline_have_distinct_replay_requests(self):
        cases = [c for c in bench.corpus() if c["name"] in ("stats", "current")]
        default = bench.requests(cases, "native")
        annotated = bench.requests(cases, "native-lines")
        self.assertFalse(any(r.get("only_rec", False) for r in default))
        self.assertEqual(
            {r["name"]: r["only_rec"] for r in annotated},
            {"stats": False, "current": True},
        )
        self.assertEqual(
            [r["bounds"] for r in annotated], [r["bounds"] for r in default]
        )

    def test_no_loss_of_sign_unit_precision_order_or_script_in_scoring(self):
        pairs = [
            ("-0.1°", "0.1°"),
            ("-0.1°", "-0.10"),
            ("33.60", "33.6"),
            ("40%", "40"),
            ("已安裝", "已安装"),
            ("馬力316hp扭力316ft·lb", "馬力扭力316hp316ft·lb"),
            ("", "J"),
            ("地平線攀爬賽", "嘉年華一公里"),
        ]
        for expected, text in pairs:
            with self.subTest(expected=expected, text=text):
                case = dict(name="field", expected=expected, category="trial")
                good = {"field": dict(text=expected, status="ok")}
                bad = {"field": dict(text=text, status="ok")}
                result = bench.score([case], [good, bad])
                self.assertEqual(result["exact"], 0)
                self.assertIn("field", result["misses"])
        self.assertEqual(bench.normalize("− ０．１°"), bench.normalize("-0.1°"))
        empty_error = bench.score(
            [dict(name="empty", expected="", category="empty")],
            [{"empty": {"status": "unknown", "error": "decoder error", "text": ""}}],
        )
        self.assertEqual(empty_error["exact"], 0)


@unittest.skipUnless(
    sys.platform == "win32" and os.environ.get("FH6_OCR_CORPUS"),
    "Set FH6_OCR_CORPUS to opt into the final DB5 workflow frame replay",
)
class WorkflowReplay(unittest.TestCase):
    def test_workflow_values_match_recorded_car_and_all_final_tuning_pages(self):
        root = Path(os.environ["FH6_OCR_CORPUS"]) / "frames"
        # Independently transcribed game values, including a selected ARB row and negative toe.
        pages = {
            "0106-tyres.png": [29.5, 28.0],
            "0107-alignment.png": [-2.1, -1.3, 0.1, -0.1, 6.0],
            "0108-arb.png": [33.6, 32.4],
            "0109-springs.png": [851.2, 829.0, 5.7, 7.0],
            "0110-damping.png": [10.7, 10.3, 6.4, 6.2],
            "0111-diff.png": [40.0, 20.0],
            "0112-gears.png": [3.99, 1.84, 1.43, 1.15, 0.96, 0.82, 0.72],
        }
        for filename, expected in pages.items():
            with self.subTest(filename=filename):
                page = read_tuning_page(root / filename)
                self.assertEqual(list(page["fields"].values()), expected)
                self.assertTrue(all(page["units"].values()))
        card = _read_card(root / "0005-current-car.png")
        self.assertEqual(card["carName"], "1964 Aston Martin DB5")
        self.assertEqual(card["drivetrain"], "RWD")
        self.assertEqual(card["performanceIndex"], 600)
        self.assertEqual(card["maxHp"], 316)
        self.assertAlmostEqual(card["maxTorque"], 428.43847167272236)
        self.assertAlmostEqual(card["weight"], 1224.699399)
        self.assertEqual(card["weight_distribution"], 51)
        self.assertEqual(
            read_tire_size(root / "0017-installed-front.png", "front"), (255, 60, 15)
        )
        self.assertEqual(
            read_tire_size(root / "0019-installed-rear.png", "rear"), (285, 55, 15)
        )


@unittest.skipUnless(
    sys.platform == "win32"
    and os.environ.get("FH6_OCR_RUNTIME")
    and os.environ.get("FH6_OCR_CORPUS"),
    "Set FH6_OCR_RUNTIME and FH6_OCR_CORPUS to opt into native OCR on recorded DB5 frames",
)
class NativeReplay(unittest.TestCase):
    def test_repeatable_reads_and_close_reopen_with_real_frames(self):
        session = NativeOcrSession()
        root = Path(os.environ["FH6_OCR_CORPUS"]) / "frames"
        cases = {c["name"]: c for c in bench.corpus()}
        try:
            for name in ("arb_front", "rear_size", "arb_front"):
                case = cases[name]
                result = bench.capture(
                    session, root / case["frame"], [case], "native-lines"
                )
                self.assertEqual(result[name]["status"], "ok")
                self.assertEqual(
                    bench.normalize(result[name]["text"]),
                    bench.normalize(case["expected"]),
                )
                if name == "rear_size":
                    session.close()
        finally:
            session.close()
