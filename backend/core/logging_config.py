import logging
import os
import re
import sys

from backend.core.config import LOG_DIR


class CleanFormatter(logging.Formatter):
    ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

    def format(self, record):
        formatted = super().format(record)
        return self.ANSI_ESCAPE.sub("", formatted)


def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    backend_log_path = os.path.join(LOG_DIR, "backend.log")

    if getattr(sys, "frozen", False):
        try:
            backend_log = open(backend_log_path, "a", encoding="utf-8", buffering=1)
            sys.stdout = backend_log
            sys.stderr = backend_log
        except Exception:
            pass

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    file_handler = logging.FileHandler(backend_log_path, encoding="utf-8")
    file_handler.setFormatter(
        CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(file_handler)

    if not getattr(sys, "frozen", False):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(
            CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        root_logger.addHandler(console_handler)

    return logging.getLogger("backend")
