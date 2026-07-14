import os
import tempfile

import main
import pytest
from fastapi.testclient import TestClient

# 匯入 fastapi app 與日誌相關設定
from main import app


@pytest.fixture
def temp_log_file():
    # 建立臨時 log 檔案，並 mock backend_log_path
    fd, temp_path = tempfile.mkstemp(suffix=".log")
    os.close(fd)

    # 備份原有的 path
    orig_path = main.backend_log_path
    main.backend_log_path = temp_path

    yield temp_path

    # 還原 path 並刪除臨時檔案
    main.backend_log_path = orig_path
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_logs_endpoint_empty(temp_log_file):
    # 測試當 log 檔不存在或為空時
    client = TestClient(app)
    response = client.get("/api/logs")
    assert response.status_code == 200
    assert response.json() == {"logs": []}


def test_logs_parsing_and_traceback_merging(temp_log_file):
    # 測試日誌解析，特別是 Traceback 拼接
    log_content = (
        "2026-07-14 13:00:00,123 [INFO] telemetry_listener: UDP Telemetry Listener started.\n"
        "2026-07-14 13:00:01,456 [ERROR] main: Failed to write tuning db\n"
        "Traceback (most recent call last):\n"
        '  File "main.py", line 120, in save_tuning\n'
        "    db.write()\n"
        "PermissionError: [Errno 13] Permission denied\n"
        "2026-07-14 13:00:02,789 [WARNING] main: Cache cleanup delayed.\n"
    )

    with open(temp_log_file, "w", encoding="utf-8") as f:
        f.write(log_content)

    client = TestClient(app)
    response = client.get("/api/logs")
    assert response.status_code == 200

    logs = response.json()["logs"]
    assert len(logs) == 3

    # 1. 第一條 INFO
    assert logs[0]["timestamp"] == "2026-07-14 13:00:00,123"
    assert logs[0]["level"] == "INFO"
    assert logs[0]["logger"] == "telemetry_listener"
    assert logs[0]["message"] == "UDP Telemetry Listener started."

    # 2. 第二條 ERROR，必須包含整個 Traceback 拼接
    assert logs[1]["timestamp"] == "2026-07-14 13:00:01,456"
    assert logs[1]["level"] == "ERROR"
    assert logs[1]["logger"] == "main"
    assert "Failed to write tuning db" in logs[1]["message"]
    assert "Traceback (most recent call last):" in logs[1]["message"]
    assert "PermissionError: [Errno 13] Permission denied" in logs[1]["message"]

    # 3. 第三條 WARNING
    assert logs[2]["timestamp"] == "2026-07-14 13:00:02,789"
    assert logs[2]["level"] == "WARNING"
    assert logs[2]["message"] == "Cache cleanup delayed."


def test_logs_endpoint_filtering(temp_log_file):
    # 測試日誌層級篩選
    log_content = (
        "2026-07-14 13:00:00,123 [INFO] main: info msg\n"
        "2026-07-14 13:00:01,123 [WARNING] main: warn msg\n"
        "2026-07-14 13:00:02,123 [ERROR] main: error msg\n"
    )

    with open(temp_log_file, "w", encoding="utf-8") as f:
        f.write(log_content)

    client = TestClient(app)

    # ALL
    response = client.get("/api/logs?level=ALL")
    assert len(response.json()["logs"]) == 3

    # ERROR only
    response = client.get("/api/logs?level=ERROR")
    logs = response.json()["logs"]
    assert len(logs) == 1
    assert logs[0]["level"] == "ERROR"
    assert logs[0]["message"] == "error msg"

    # WARNING only
    response = client.get("/api/logs?level=WARNING")
    logs = response.json()["logs"]
    assert len(logs) == 1
    assert logs[0]["level"] == "WARNING"
    assert logs[0]["message"] == "warn msg"


def test_logs_endpoint_limit(temp_log_file):
    # 測試 limit 限制
    log_content = "\n".join(
        [f"2026-07-14 13:00:0{i},123 [INFO] main: msg {i}" for i in range(5)]
    )

    with open(temp_log_file, "w", encoding="utf-8") as f:
        f.write(log_content)

    client = TestClient(app)
    response = client.get("/api/logs?limit=2")
    logs = response.json()["logs"]
    assert len(logs) == 2
    assert logs[0]["message"] == "msg 3"
    assert logs[1]["message"] == "msg 4"


def test_logs_endpoint_delete(temp_log_file):
    # 測試 DELETE 清空
    log_content = "2026-07-14 13:00:00,123 [INFO] main: msg\n"
    with open(temp_log_file, "w", encoding="utf-8") as f:
        f.write(log_content)

    client = TestClient(app)

    # 驗證有資料
    response = client.get("/api/logs")
    assert len(response.json()["logs"]) == 1

    # 刪除
    delete_res = client.delete("/api/logs")
    assert delete_res.status_code == 200
    assert delete_res.json() == {"message": "Logs cleared successfully"}

    # 驗證空了
    response = client.get("/api/logs")
    assert len(response.json()["logs"]) == 0
    with open(temp_log_file, "r", encoding="utf-8") as f:
        assert f.read() == ""
