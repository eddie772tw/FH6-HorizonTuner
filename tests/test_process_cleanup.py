"""Unit tests for backend/process_cleanup.py port inspection and stale process cleanup."""

import os
import socket
import sys
import unittest
from unittest.mock import MagicMock, patch

from backend.process_cleanup import (
    _decode_port,
    cleanup_stale_port_listeners,
    get_port_owning_pids,
    get_port_owning_pids_fallback,
    is_horizontuner_stale_process,
    terminate_stale_process,
)


class TestProcessCleanup(unittest.TestCase):
    def test_decode_port(self):
        # Port 8000 in network byte order: htons(8000) = 0x401F (16415 in decimal)
        raw_val = socket.htons(8000)
        self.assertEqual(_decode_port(raw_val), 8000)

        # Port 8001
        raw_val_8001 = socket.htons(8001)
        self.assertEqual(_decode_port(raw_val_8001), 8001)

        # Port 5300
        raw_val_5300 = socket.htons(5300)
        self.assertEqual(_decode_port(raw_val_5300), 5300)

    def test_is_horizontuner_stale_process_boundaries(self):
        curr_pid = os.getpid()

        # 1. Invalid or self PID
        self.assertFalse(is_horizontuner_stale_process(0))
        self.assertFalse(is_horizontuner_stale_process(-1))
        self.assertFalse(is_horizontuner_stale_process(curr_pid, current_pid=curr_pid))
        self.assertFalse(is_horizontuner_stale_process(curr_pid))

        # 2. Third-party processes (Safety guarantee: NEVER match external apps)
        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"C:\Windows\System32\svchost.exe",
        ):
            self.assertFalse(is_horizontuner_stale_process(12345))

        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"C:\Program Files (x86)\Steam\steamapps\common\ForzaHorizon5\ForzaHorizon5.exe",
        ):
            self.assertFalse(is_horizontuner_stale_process(22222))

        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"C:\Program Files\SimHub\SimHubWPF.exe",
        ):
            self.assertFalse(is_horizontuner_stale_process(33333))

        with patch("backend.process_cleanup.get_process_image_path", return_value=None):
            # Unresolvable path -> must return False for safety
            self.assertFalse(is_horizontuner_stale_process(44444))

        # 3. HorizonTuner Sidecar executable
        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"C:\Users\test\AppData\Local\Temp\FH6-HorizonTuner\server-sidecar-x86_64-pc-windows-msvc.exe",
        ):
            self.assertTrue(is_horizontuner_stale_process(55555))

        # 4. HorizonTuner standalone executable
        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"D:\Release\HorizonTuner.exe",
        ):
            self.assertTrue(is_horizontuner_stale_process(66666))

        # 5. Workspace / .venv Python process
        with patch(
            "backend.process_cleanup.get_process_image_path",
            return_value=r"D:\FH6-HorizonTuner\.venv\Scripts\python.exe",
        ):
            self.assertTrue(is_horizontuner_stale_process(77777))

    def test_netstat_fallback_parsing(self):
        fake_netstat_output = """
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  UDP    0.0.0.0:8000           *:*                                    9988
  UDP    127.0.0.1:8001         *:*                                    9989
  TCP    0.0.0.0:8001           0.0.0.0:0              LISTENING       1122
"""
        with patch("subprocess.check_output", return_value=fake_netstat_output):
            pids_8000_udp = get_port_owning_pids_fallback(8000, is_udp=True)
            self.assertEqual(pids_8000_udp, [9988])

            pids_8001_udp = get_port_owning_pids_fallback(8001, is_udp=True)
            self.assertEqual(pids_8001_udp, [9989])

            pids_8001_tcp = get_port_owning_pids_fallback(8001, is_udp=False)
            self.assertEqual(pids_8001_tcp, [1122])

            pids_9999 = get_port_owning_pids_fallback(9999, is_udp=True)
            self.assertEqual(pids_9999, [])

    @patch("backend.process_cleanup.get_port_owning_pids")
    @patch("backend.process_cleanup.is_horizontuner_stale_process")
    @patch("backend.process_cleanup.terminate_stale_process")
    def test_cleanup_stale_port_listeners_flow(
        self, mock_terminate, mock_is_horizontuner, mock_get_pids
    ):
        mock_get_pids.return_value = [1001, 1002, 1003]

        # 1001 is current PID (should be ignored by cleanup)
        # 1002 is third-party app (should not be killed)
        # 1003 is stale HorizonTuner sidecar (should be killed)
        def side_effect_is_ht(pid, current_pid=None):
            return pid == 1003

        mock_is_horizontuner.side_effect = side_effect_is_ht
        mock_terminate.return_value = True

        cleaned = cleanup_stale_port_listeners(8000, current_pid=1001, is_udp=True)

        self.assertEqual(cleaned, [1003])
        mock_terminate.assert_called_once_with(1003, timeout_sec=1.5)


if __name__ == "__main__":
    unittest.main()
