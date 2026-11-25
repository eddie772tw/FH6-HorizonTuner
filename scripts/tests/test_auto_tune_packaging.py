import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from scripts.prepare_auto_tune_runtime import acquire, unpack_python


class OfflineBuildInputs(unittest.TestCase):
    def test_offline_cache_rejects_corruption_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            checksum = hashlib.sha256(b"verified").hexdigest()
            spec = {"url": "https://example.invalid/source", "sha256": checksum}
            path = cache / checksum
            path.write_bytes(b"verified")
            with patch("urllib.request.urlopen", side_effect=AssertionError("network")):
                self.assertEqual(acquire(spec, cache, True), path)
                path.write_bytes(b"modified")
                with self.assertRaisesRegex(RuntimeError, "Missing verified"):
                    acquire(spec, cache, True)

    def test_embeddable_python_ignores_site_and_rejects_archive_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "python.zip"
            output = root / "python"
            output.mkdir()
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("python313._pth", "import site\nZ:/global\n")
            unpack_python(archive, output)
            self.assertEqual(
                (output / "python313._pth").read_text(), "python313.zip\n.\n..\n"
            )
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("../outside.dll", b"bad")
            with self.assertRaisesRegex(ValueError, "Unexpected Python archive"):
                unpack_python(archive, output)
            self.assertFalse((root / "outside.dll").exists())
