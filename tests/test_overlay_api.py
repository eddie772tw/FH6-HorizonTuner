import os
import tempfile
from unittest.mock import MagicMock, patch

import main
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def temp_layout_file():
    # 建立臨時 layout 檔案，並 mock LAYOUT_FILE
    fd, temp_path = tempfile.mkstemp(suffix=".json")
    os.close(fd)

    # 先刪除它，以模擬初始「檔案不存在」的狀態，測試預設值回傳
    if os.path.exists(temp_path):
        os.remove(temp_path)

    # 備份原有的 layout.json 路徑
    orig_path = main.LAYOUT_FILE
    main.LAYOUT_FILE = temp_path

    yield temp_path

    # 還原原路徑並清理
    main.LAYOUT_FILE = orig_path
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_get_layout_default(temp_layout_file):
    # 1. 測試當 layout.json 不存在時，是否正確返回 DEFAULT_LAYOUT
    client = TestClient(app)
    response = client.get("/api/overlay/layout")
    assert response.status_code == 200

    data = response.json()
    assert "modules" in data
    assert data["modules"]["tireTemp"]["visible"] is True
    assert data["modules"]["dashboard"]["x"] == 290


def test_save_and_get_layout(temp_layout_file):
    # 2. 測試自訂佈局的儲存與讀取同步
    client = TestClient(app)

    custom_layout = {
        "canvas": {"w": 1024, "h": 768},
        "components": [
            {
                "id": "test_text",
                "type": "Text",
                "x": 10,
                "y": 20,
                "w": 100,
                "h": 50,
                "visible": True,
                "bindings": {"value": "speed", "color": "#ff0000"},
            }
        ],
    }

    # 儲存
    post_res = client.post("/api/overlay/layout", json=custom_layout)
    assert post_res.status_code == 200
    assert post_res.json() == {"message": "Layout saved successfully"}

    # 驗證實體檔案是否寫入
    assert os.path.exists(temp_layout_file)

    # 讀取，驗證讀出的資料與存入的一致
    get_res = client.get("/api/overlay/layout")
    assert get_res.status_code == 200

    loaded_data = get_res.json()
    assert loaded_data["canvas"]["w"] == 1024
    assert loaded_data["components"][0]["id"] == "test_text"
    assert loaded_data["components"][0]["bindings"]["value"] == "speed"


def test_overlay_status_not_running():
    # 3. 測試當 Overlay 未啟動時的狀態
    main.overlay_process = None
    client = TestClient(app)

    response = client.get("/api/overlay/status")
    assert response.status_code == 200
    assert response.json() == {"running": False}


def test_overlay_stop_not_running():
    # 4. 測試停止未運行的 Overlay 是否正常返回成功
    main.overlay_process = None
    client = TestClient(app)

    response = client.post("/api/overlay/stop")
    assert response.status_code == 200
    assert response.json() == {"message": "Overlay is not running", "success": True}


@patch("os.path.exists")
@patch("subprocess.Popen")
def test_overlay_start_success(mock_popen, mock_exists):
    # 5. 測試 Overlay 啟動成功的邏輯
    mock_exists.return_value = True  # 模擬 HorizonTunerOverlay.exe 檔案存在

    # 模擬 Popen 回傳一個 Mock 的處理序對象
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # poll() 為 None 代表行程還在運作中
    mock_popen.return_value = mock_proc

    main.overlay_process = None
    client = TestClient(app)

    response = client.post("/api/overlay/start")
    assert response.status_code == 200

    res_data = response.json()
    assert res_data["success"] is True
    assert "Overlay started successfully" in res_data["message"]

    # 驗證全域的 overlay_process 變數是否成功被指派
    assert main.overlay_process == mock_proc

    # 驗證是否呼叫了 Popen 且傳入了正確的 -port 參數
    mock_popen.assert_called_once()
    args, kwargs = mock_popen.call_args
    assert "-port" in args[0]


def test_overlay_status_running():
    # 6. 測試當 Overlay 正在運行時的狀態回報
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # 代表進行中
    main.overlay_process = mock_proc

    client = TestClient(app)
    response = client.get("/api/overlay/status")
    assert response.status_code == 200
    assert response.json() == {"running": True}


def test_overlay_stop_running():
    # 7. 測試正常終止運行中的 Overlay
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # 運行中
    main.overlay_process = mock_proc

    client = TestClient(app)
    response = client.post("/api/overlay/stop")
    assert response.status_code == 200

    res_data = response.json()
    assert res_data["success"] is True
    assert "Overlay stopped successfully" in res_data["message"]

    # 驗證是否調用了終止與等待
    mock_proc.terminate.assert_called_once()
    mock_proc.wait.assert_called_once_with(timeout=2)

    # 驗證全域變數已被設回 None
    assert main.overlay_process is None
