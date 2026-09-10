"""Exercise DEV health checks with real subprocesses and loopback HTTP."""

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scripts.dev_startup import check_imports, wait_backend


def test_import_success_and_missing_module():
    assert check_imports(("json",)) == 0
    assert check_imports(("fh6_nonexistent_dependency",)) == 1


def test_hung_import_is_bounded_and_distinct_from_missing_package(
    tmp_path, monkeypatch
):
    (tmp_path / "slow_dependency.py").write_text("import time; time.sleep(60)")
    monkeypatch.setenv("PYTHONPATH", str(tmp_path))
    assert check_imports(("slow_dependency",), timeout=0.5) == 2


def test_port_file_alone_is_not_readiness(tmp_path):
    (tmp_path / "logs").mkdir()
    (tmp_path / "logs/web_port.txt").write_text("invalid")
    assert wait_backend(tmp_path, timeout=0.05) == 1


def test_backend_requires_successful_http(tmp_path):
    class Handler(BaseHTTPRequestHandler):
        status = 503

        def do_GET(self):
            self.send_response(self.status if self.path == "/api/settings" else 404)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    (tmp_path / "logs").mkdir()
    (tmp_path / "logs/web_port.txt").write_text(str(server.server_port))
    try:
        assert wait_backend(tmp_path, timeout=0.1) == 1
        Handler.status = 200
        assert wait_backend(tmp_path, timeout=1) == 0
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
