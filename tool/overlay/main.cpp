#include <windows.h>
#include <iostream>
#include <mutex>
#include <fstream>
#include <string>
#include <sstream>

// ImGui
#include "imgui.h"
#include "imgui_impl_win32.h"
#include "imgui_impl_dx11.h"

// 我們的組件
#include "DXGIOverlayManager.h"
#include "WebSocketClient.h"

// nlohmann/json (將由 CMake 下載)
#include <nlohmann/json.hpp>
using json = nlohmann::json;

// 外部宣告 ImGui WndProc 處理程序
extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

// 遙測數據結構
struct TelemetryData {
    bool isRaceOn = false;
    float currentEngineRpm = 0.0f;
    float engineMaxRpm = 6000.0f;
    float engineIdleRpm = 1000.0f;
    float speed = 0.0f;
    int gear = 0;
    float tireTemp[4] = { 0.0f }; // FL, FR, RL, RR
    float suspTravel[4] = { 0.0f };
    float slipRatio[4] = { 0.0f };
    float slipAngle[4] = { 0.0f };
    float accel[3] = { 0.0f }; // X, Y, Z
    float roll = 0.0f;
    float pitch = 0.0f;
    float yaw = 0.0f;
    float power = 0.0f;
    float boost = 0.0f;
};

// 模組佈局結構
struct ModuleLayout {
    bool visible = true;
    float x = 0.0f;
    float y = 0.0f;
    float w = 200.0f;
    float h = 150.0f;
};

// 全局變數
DXGIOverlayManager g_OverlayManager;
WebSocketClient    g_WSClient;
TelemetryData      g_Telemetry;
std::mutex         g_TelemetryMutex;

ModuleLayout g_LayoutTireTemp   = { true, 50.0f, 50.0f, 250.0f, 180.0f };
ModuleLayout g_LayoutSuspTravel = { true, 320.0f, 50.0f, 200.0f, 180.0f };
ModuleLayout g_LayoutSlipLimit  = { true, 540.0f, 50.0f, 220.0f, 220.0f };
ModuleLayout g_LayoutGForce     = { true, 50.0f, 250.0f, 220.0f, 220.0f };
ModuleLayout g_LayoutDashboard  = { true, 290.0f, 250.0f, 470.0f, 120.0f };

std::mutex g_LayoutMutex;
std::wstring g_LayoutFilePath = L"layout.json";

// 載入佈局設定
void LoadLayoutConfig() {
    std::lock_guard<std::mutex> lock(g_LayoutMutex);
    std::ifstream file(g_LayoutFilePath);
    if (!file.is_open()) return;

    try {
        json j;
        file >> j;
        if (j.contains("modules")) {
            auto modules = j["modules"];
            auto loadModule = [](auto& m, ModuleLayout& layout) {
                if (m.contains("visible")) layout.visible = m["visible"];
                if (m.contains("x")) layout.x = m["x"];
                if (m.contains("y")) layout.y = m["y"];
                if (m.contains("w")) layout.w = m["w"];
                if (m.contains("h")) layout.h = m["h"];
            };

            if (modules.contains("tireTemp")) loadModule(modules["tireTemp"], g_LayoutTireTemp);
            if (modules.contains("suspTravel")) loadModule(modules["suspTravel"], g_LayoutSuspTravel);
            if (modules.contains("slipLimit")) loadModule(modules["slipLimit"], g_LayoutSlipLimit);
            if (modules.contains("gForce")) loadModule(modules["gForce"], g_LayoutGForce);
            if (modules.contains("dashboard")) loadModule(modules["dashboard"], g_LayoutDashboard);
        }
    }
    catch (const std::exception& e) {
        std::cerr << "[Overlay] 解析佈局檔案錯誤: " << e.what() << "\n";
    }
}

// 監控佈局檔案變更 (簡單的定時加載)
void TickLayoutMonitor() {
    static DWORD lastTick = 0;
    DWORD currentTick = GetTickCount();
    if (currentTick - lastTick > 1000) { // 每秒加載一次
        LoadLayoutConfig();
        lastTick = currentTick;
    }
}

// WebSocket 訊息回調
void OnWebSocketMessage(const std::string& msg) {
    try {
        json j = json::parse(msg);
        std::lock_guard<std::mutex> lock(g_TelemetryMutex);

        if (j.contains("IsRaceOn")) g_Telemetry.isRaceOn = j["IsRaceOn"] == 1;
        if (j.contains("CurrentEngineRpm")) g_Telemetry.currentEngineRpm = j["CurrentEngineRpm"];
        if (j.contains("EngineMaxRpm")) g_Telemetry.engineMaxRpm = j["EngineMaxRpm"];
        if (j.contains("EngineIdleRpm")) g_Telemetry.engineIdleRpm = j["EngineIdleRpm"];
        if (j.contains("SpeedMetersPerSecond")) g_Telemetry.speed = j["SpeedMetersPerSecond"] * 3.6f; // m/s -> km/h
        if (j.contains("Gear")) g_Telemetry.gear = j["Gear"];
        if (j.contains("PowerWatts")) g_Telemetry.power = j["PowerWatts"] / 745.7f; // W -> HP
        if (j.contains("Boost")) g_Telemetry.boost = j["Boost"] / 6894.75729f; // Pa -> PSI

        if (j.contains("TireTemp") && j["TireTemp"].is_array() && j["TireTemp"].size() >= 4) {
            for (int i = 0; i < 4; ++i) g_Telemetry.tireTemp[i] = j["TireTemp"][i];
        }
        if (j.contains("NormalizedSuspensionTravel") && j["NormalizedSuspensionTravel"].is_array() && j["NormalizedSuspensionTravel"].size() >= 4) {
            for (int i = 0; i < 4; ++i) g_Telemetry.suspTravel[i] = j["NormalizedSuspensionTravel"][i];
        }
        if (j.contains("TireSlipRatio") && j["TireSlipRatio"].is_array() && j["TireSlipRatio"].size() >= 4) {
            for (int i = 0; i < 4; ++i) g_Telemetry.slipRatio[i] = j["TireSlipRatio"][i];
        }
        if (j.contains("TireSlipAngle") && j["TireSlipAngle"].is_array() && j["TireSlipAngle"].size() >= 4) {
            for (int i = 0; i < 4; ++i) g_Telemetry.slipAngle[i] = j["TireSlipAngle"][i];
        }
        if (j.contains("AccelerationX")) g_Telemetry.accel[0] = j["AccelerationX"] / 9.81f; // m/s^2 -> G
        if (j.contains("AccelerationY")) g_Telemetry.accel[1] = j["AccelerationY"] / 9.81f;
        if (j.contains("AccelerationZ")) g_Telemetry.accel[2] = j["AccelerationZ"] / 9.81f;
        if (j.contains("Yaw")) g_Telemetry.yaw = j["Yaw"];
    }
    catch (const std::exception& e) {
        // 解析可能因封包格式不完全而失敗，忽略
    }
}

// 繪製 ImGui UI 模組
void RenderTelemetryUI() {
    TelemetryData t;
    {
        std::lock_guard<std::mutex> lock(g_TelemetryMutex);
        t = g_Telemetry;
    }

    ModuleLayout layTire, laySusp, laySlip, layG, layDash;
    {
        std::lock_guard<std::mutex> lock(g_LayoutMutex);
        layTire = g_LayoutTireTemp;
        laySusp = g_LayoutSuspTravel;
        laySlip = g_LayoutSlipLimit;
        layG = g_LayoutGForce;
        layDash = g_LayoutDashboard;
    }

    // 設置 ImGui 視窗無邊框、無背景、不可移動、不可縮放（由 Tauri 配置控制）
    ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoDecoration | 
                                   ImGuiWindowFlags_NoMove | 
                                   ImGuiWindowFlags_NoResize | 
                                   ImGuiWindowFlags_NoSavedSettings | 
                                   ImGuiWindowFlags_NoFocusOnAppearing | 
                                   ImGuiWindowFlags_NoNav;

    // 模組一：輪胎溫度與胎壓
    if (layTire.visible) {
        ImGui::SetNextWindowPos(ImVec2(layTire.x, layTire.y));
        ImGui::SetNextWindowSize(ImVec2(layTire.w, layTire.h));
        ImGui::Begin("Tire Thermodynamics", nullptr, windowFlags);
        ImGui::Text("TIRE TEMPERATURE (°C)");
        ImGui::Separator();

        // 繪製 2x2 輪胎區塊
        const char* labels[4] = { "FL", "FR", "RL", "RR" };
        ImGui::Columns(2, "tire_grid", false);
        for (int i = 0; i < 4; ++i) {
            float temp = t.tireTemp[i];
            
            // 色彩區間映射 (低溫藍 ➔ 正常綠 ➔ 高溫紅)
            ImVec4 color = ImVec4(0.0f, 1.0f, 0.0f, 1.0f); // 預設綠色 (70-90度)
            if (temp < 70.0f) {
                float t_factor = max(0.0f, (temp - 30.0f) / 40.0f);
                color = ImVec4(0.0f, t_factor, 1.0f - t_factor, 1.0f); // 藍色漸變到綠色
            } else if (temp > 90.0f) {
                float t_factor = min(1.0f, (temp - 90.0f) / 30.0f);
                color = ImVec4(t_factor, 1.0f - t_factor, 0.0f, 1.0f); // 綠色漸變到紅色
            }

            ImGui::Text("%s:", labels[i]);
            ImGui::SameLine();
            ImGui::TextColored(color, "%.1f °C", temp);
            ImGui::NextColumn();
        }
        ImGui::Columns(1);
        ImGui::End();
    }

    // 模組二：懸吊行程監控
    if (laySusp.visible) {
        ImGui::SetNextWindowPos(ImVec2(laySusp.x, laySusp.y));
        ImGui::SetNextWindowSize(ImVec2(laySusp.w, laySusp.h));
        ImGui::Begin("Suspension Travel", nullptr, windowFlags);
        ImGui::Text("SUSPENSION TRAVEL");
        ImGui::Separator();

        const char* labels[4] = { "FL", "FR", "RL", "RR" };
        for (int i = 0; i < 4; ++i) {
            float travel = t.suspTravel[i];
            // 繪製進度條表示行程，接近 1.0 (觸底) 時閃爍紅色
            ImVec4 progressColor = ImVec4(0.2f, 0.7f, 1.0f, 1.0f);
            if (travel > 0.95f) {
                // 觸底警告閃爍
                float flash = (float)sin(GetTickCount() * 0.02) * 0.5f + 0.5f;
                progressColor = ImVec4(1.0f, 0.0f, 0.0f, flash);
            }
            ImGui::Text("%s: %.2f", labels[i], travel);
            ImGui::SameLine(60);
            ImGui::PushStyleColor(ImGuiCol_PlotHistogram, progressColor);
            ImGui::ProgressBar(travel, ImVec2(-1, 14), "");
            ImGui::PopStyleColor();
        }
        ImGui::End();
    }

    // 模組三：輪胎抓地極限 (G-G Diagram & Slip)
    if (laySlip.visible) {
        ImGui::SetNextWindowPos(ImVec2(laySlip.x, laySlip.y));
        ImGui::SetNextWindowSize(ImVec2(laySlip.w, laySlip.h));
        ImGui::Begin("Slip Diagram", nullptr, windowFlags);
        ImGui::Text("SLIP RATIO / ANGLE");
        ImGui::Separator();

        const char* labels[4] = { "FL", "FR", "RL", "RR" };
        for (int i = 0; i < 4; ++i) {
            float slipRatio = t.slipRatio[i];
            float slipAngle = t.slipAngle[i] * 57.29578f; // 弧度轉角度
            
            ImGui::Text("%s: Ratio: %+.2f | Angle: %+.1f°", labels[i], slipRatio, slipAngle);
        }
        ImGui::End();
    }

    // 模組四：G力感應
    if (layG.visible) {
        ImGui::SetNextWindowPos(ImVec2(layG.x, layG.y));
        ImGui::SetNextWindowSize(ImVec2(layG.w, layG.h));
        ImGui::Begin("G-Force", nullptr, windowFlags);
        ImGui::Text("G-FORCE");
        ImGui::Separator();

        ImGui::Text("Lat (X): %+.2f G", t.accel[0]);
        ImGui::Text("Vert (Y): %+.2f G", t.accel[1]);
        ImGui::Text("Long (Z): %+.2f G", t.accel[2]);

        // 簡單繪製一個 G-G 二維點圖
        ImDrawList* drawList = ImGui::GetWindowDrawList();
        ImVec2 winPos = ImGui::GetWindowPos();
        ImVec2 center = ImVec2(winPos.x + layG.w * 0.5f, winPos.y + layG.h * 0.6f);
        float radius = min(layG.w, layG.h) * 0.25f;

        // 繪製圓盤背景
        drawList->AddCircle(center, radius, IM_COL32(100, 100, 100, 150), 32, 1.0f);
        drawList->AddCircle(center, radius * 0.5f, IM_COL32(70, 70, 70, 100), 32, 1.0f);
        drawList->AddLine(ImVec2(center.x - radius, center.y), ImVec2(center.x + radius, center.y), IM_COL32(80, 80, 80, 150));
        drawList->AddLine(ImVec2(center.x, center.y - radius), ImVec2(center.x, center.y + radius), IM_COL32(80, 80, 80, 150));

        // 計算 G 力點位置 (最大限制為 3G)
        float maxG = 2.0f;
        float ptX = center.x + (t.accel[0] / maxG) * radius;
        float ptY = center.y - (t.accel[2] / maxG) * radius; // Z 負值為向前加速，映射至螢幕上方

        // 限制在圓盤內
        float dist = sqrt(pow(ptX - center.x, 2) + pow(ptY - center.y, 2));
        if (dist > radius) {
            float angle = atan2(ptY - center.y, ptX - center.x);
            ptX = center.x + cos(angle) * radius;
            ptY = center.y + sin(angle) * radius;
        }

        // 繪製目前的 G 力點
        drawList->AddCircleFilled(ImVec2(ptX, ptY), 5.0f, IM_COL32(255, 50, 50, 255));
        ImGui::End();
    }

    // 模組五：動力與換檔主儀表板
    if (layDash.visible) {
        ImGui::SetNextWindowPos(ImVec2(layDash.x, layDash.y));
        ImGui::SetNextWindowSize(ImVec2(layDash.w, layDash.h));
        ImGui::Begin("Dashboard", nullptr, windowFlags);

        // 大檔位顯示
        ImGui::PushFont(ImGui::GetIO().Fonts->Fonts[0]); // 假設使用大字體
        char gearChar = (t.gear == 0) ? 'R' : (t.gear == 11) ? 'N' : '0' + t.gear;
        if (t.gear == 11) gearChar = 'N'; // 預防
        ImGui::Text("GEAR");
        ImGui::SameLine(50);
        ImGui::TextColored(ImVec4(1.0f, 0.8f, 0.0f, 1.0f), "%c", gearChar);
        ImGui::PopFont();

        ImGui::SameLine(120);
        ImGui::BeginGroup();
        ImGui::Text("SPEED:  %.0f km/h", t.speed);
        ImGui::Text("POWER:  %.0f HP", t.power);
        ImGui::Text("BOOST:  %.2f PSI", t.boost);
        ImGui::EndGroup();

        // 轉速條
        float rpmRatio = 0.0f;
        if (t.engineMaxRpm > 0) {
            rpmRatio = (t.currentEngineRpm - t.engineIdleRpm) / (t.engineMaxRpm - t.engineIdleRpm);
            rpmRatio = max(0.0f, min(1.0f, rpmRatio));
        }

        ImVec4 rpmColor = ImVec4(0.0f, 1.0f, 0.0f, 1.0f);
        if (rpmRatio > 0.85f) {
            // 超過 85% 紅線閃爍
            float flash = (float)sin(GetTickCount() * 0.04) * 0.5f + 0.5f;
            rpmColor = ImVec4(1.0f, 0.0f, 0.0f, flash);
        } else if (rpmRatio > 0.7f) {
            rpmColor = ImVec4(1.0f, 0.6f, 0.0f, 1.0f); // 黃橘色
        }

        ImGui::PushStyleColor(ImGuiCol_PlotHistogram, rpmColor);
        ImGui::ProgressBar(rpmRatio, ImVec2(-1, 15), "");
        ImGui::PopStyleColor();

        ImGui::End();
    }
}

// Win32 視窗回調程序
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    if (ImGui_ImplWin32_WndProcHandler(hWnd, message, wParam, lParam))
        return true;

    switch (message) {
    case WM_MOVE:
    case WM_WINDOWPOSCHANGED:
        g_OverlayManager.OnWindowMoved();
        break;
    case WM_DESTROY:
        PostQuitMessage(0);
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
                     _In_opt_ HINSTANCE hPrevInstance,
                     _In_ LPWSTR    lpCmdLine,
                     _In_ int       nCmdShow) {
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);

    // 解析啟動參數 (可指定 Port 等)
    int port = 8000;
    for (int i = 1; i < __argc; ++i) {
        if (wcscmp(__wargv[i], L"-port") == 0 && i + 1 < __argc) {
            port = _wtoi(__wargv[i + 1]);
        }
    }
    std::wstring wsPath = L"/ws/telemetry";
    
    // 預設寬高為螢幕大小
    UINT width = GetSystemMetrics(SM_CXSCREEN);
    UINT height = GetSystemMetrics(SM_CYSCREEN);

    // 1. 註冊 Win32 視窗類別
    const wchar_t szWindowClass[] = L"HorizonTunerOverlayClass";
    const wchar_t szTitle[] = L"HorizonTuner Overlay";

    WNDCLASSEXW wcex = {};
    wcex.cbSize = sizeof(WNDCLASSEX);
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.hInstance = hInstance;
    wcex.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wcex.lpszClassName = szWindowClass;
    RegisterClassExW(&wcex);

    // 2. 建立視窗 (為 MPO 初始化做無邊框置頂樣式)
    HWND hWnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TRANSPARENT,
        szWindowClass,
        szTitle,
        WS_POPUP,
        0, 0, width, height,
        nullptr, nullptr, hInstance, nullptr
    );

    if (!hWnd) return FALSE;

    // 3. 初始化 DXGIOverlayManager (自動檢查並選擇 MPO 或是 方案 B 降級)
    if (!g_OverlayManager.Initialize(hWnd, width, height)) {
        MessageBoxW(nullptr, L"無法初始化 D3D11 與 Overlay 交換鏈。", L"錯誤", MB_ICONERROR);
        return FALSE;
    }

    // 4. 初始化 ImGui
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO(); (void)io;
    // 禁用 imgui.ini，防止產生不必要的設定檔
    io.IniFilename = nullptr;

    // 設定暗色系樣式
    ImGui::StyleColorsDark();

    // 調整樣式以符合高質感微動畫/發光透明效果
    ImGuiStyle& style = ImGui::GetStyle();
    style.WindowRounding = 8.0f;
    style.Colors[ImGuiCol_WindowBg] = ImVec4(0.0f, 0.0f, 0.0f, 0.7f); // 半透明背景
    style.Colors[ImGuiCol_Border] = ImVec4(0.2f, 0.7f, 1.0f, 0.4f);   // 科技藍邊框

    ImGui_ImplWin32_Init(hWnd);
    ImGui_ImplDX11_Init(g_OverlayManager.GetDevice(), g_OverlayManager.GetContext());

    // 5. 載入佈局配置
    LoadLayoutConfig();

    // 6. 連線 Python 後端 WebSocket
    // 我們可以從啟動目錄下的 logs/web_port.txt 讀取後端 Port
    std::ifstream portFile("logs/web_port.txt");
    if (!portFile.is_open()) {
        portFile.open("../logs/web_port.txt"); // 嘗試上一級目錄
    }
    if (portFile.is_open()) {
        portFile >> port;
    }

    std::cout << "[Overlay] 嘗試連接後端 WebSocket: 127.0.0.1:" << port << wsPath.c_str() << "...\n";
    g_WSClient.Connect(L"127.0.0.1", port, wsPath, OnWebSocketMessage);

    // 顯示視窗
    ShowWindow(hWnd, SW_SHOW);
    UpdateWindow(hWnd);

    // 主訊息循環
    MSG msg;
    bool bRunning = true;
    while (bRunning) {
        // 處理 Win32 訊息
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
            if (msg.message == WM_QUIT) {
                bRunning = false;
            }
        }

        if (!bRunning) break;

        // 定期監控與加載佈局設定檔
        TickLayoutMonitor();

        // 開始 DXGI 幀繪製
        g_OverlayManager.BeginFrame();

        // 開始 ImGui 幀
        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        // 渲染遙測
        RenderTelemetryUI();

        // 結束 ImGui 幀並提交渲染
        ImGui::Render();
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

        // 結束 DXGI 幀，Present 呈現
        g_OverlayManager.EndFrame();

        // 若 WebSocket 斷線，定時重連
        if (!g_WSClient.IsConnected() && (GetTickCount() % 300 == 0)) {
            g_WSClient.Connect(L"127.0.0.1", port, wsPath, OnWebSocketMessage);
        }
    }

    // 釋放資源
    g_WSClient.Disconnect();
    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    g_OverlayManager.Shutdown();

    return (int)msg.wParam;
}
