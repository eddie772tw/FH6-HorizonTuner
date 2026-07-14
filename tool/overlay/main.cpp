#include <windows.h>
#include <iostream>
#include <mutex>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>

// ImGui
#include "imgui.h"
#include "imgui_impl_win32.h"
#include "imgui_impl_dx11.h"

// ExprTk
#include <exprtk.hpp>

// 我們的組件
#include "DXGIOverlayManager.h"
#include "WebSocketClient.h"

// nlohmann/json
#include <nlohmann/json.hpp>
using json = nlohmann::json;

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

// 用於表達式求值的全域變數 (記憶體地址必須保持固定)
float ev_rpm = 0.0f;
float ev_maxRpm = 6000.0f;
float ev_idleRpm = 1000.0f;
float ev_speed = 0.0f;
float ev_gear = 0.0f;
float ev_power = 0.0f;
float ev_boost = 0.0f;
float ev_accelX = 0.0f, ev_accelY = 0.0f, ev_accelZ = 0.0f;
float ev_yaw = 0.0f, ev_pitch = 0.0f, ev_roll = 0.0f;
float ev_tireTempFL = 0.0f, ev_tireTempFR = 0.0f, ev_tireTempRL = 0.0f, ev_tireTempRR = 0.0f;
float ev_suspTravelFL = 0.0f, ev_suspTravelFR = 0.0f, ev_suspTravelRL = 0.0f, ev_suspTravelRR = 0.0f;
float ev_slipRatioFL = 0.0f, ev_slipRatioFR = 0.0f, ev_slipRatioRL = 0.0f, ev_slipRatioRR = 0.0f;
float ev_slipAngleFL = 0.0f, ev_slipAngleFR = 0.0f, ev_slipAngleRL = 0.0f, ev_slipAngleRR = 0.0f;

exprtk::symbol_table<float> g_SymbolTable;

// 表達式綁定結構
struct ExpressionBinding {
    std::string formula;
    exprtk::expression<float> expr;
    bool valid = false;

    void Compile(const std::string& f) {
        formula = f;
        if (formula.empty()) {
            valid = false;
            return;
        }
        expr.register_symbol_table(g_SymbolTable);
        exprtk::parser<float> parser;
        if (parser.compile(formula, expr)) {
            valid = true;
        } else {
            valid = false;
            std::cerr << "[Expression] 編譯公式失敗: " << formula << "\n";
        }
    }

    float Evaluate(float defaultValue = 0.0f) {
        if (!valid) return defaultValue;
        return expr.value();
    }
};

// 解析 HEX 顏色字串
ImVec4 ParseHexColor(const std::string& hex) {
    if (hex.empty() || hex[0] != '#') return ImVec4(1, 1, 1, 1);
    
    std::string cleanHex = hex.substr(1);
    unsigned int colorVal = 0;
    std::stringstream ss;
    ss << std::hex << cleanHex;
    ss >> colorVal;

    float r = 1.0f, g = 1.0f, b = 1.0f, a = 1.0f;
    if (cleanHex.length() == 6) {
        r = ((colorVal >> 16) & 0xFF) / 255.0f;
        g = ((colorVal >> 8) & 0xFF) / 255.0f;
        b = (colorVal & 0xFF) / 255.0f;
    } else if (cleanHex.length() == 8) {
        r = ((colorVal >> 24) & 0xFF) / 255.0f;
        g = ((colorVal >> 16) & 0xFF) / 255.0f;
        b = ((colorVal >> 8) & 0xFF) / 255.0f;
        a = (colorVal & 0xFF) / 255.0f;
    }
    return ImVec4(r, g, b, a);
}

// 條件色彩配置
struct ColorRule {
    std::string formula;
    ExpressionBinding binding;
    ImVec4 colorValue;
};

struct ComponentColor {
    std::vector<ColorRule> rules;
    ImVec4 defaultColor = ImVec4(1, 1, 1, 1);

    void Parse(const json& j) {
        rules.clear();
        defaultColor = ImVec4(1, 1, 1, 1);

        if (j.is_string()) {
            defaultColor = ParseHexColor(j.get<std::string>());
            return;
        }

        if (j.is_object() && j.contains("colorRules")) {
            for (auto& rule : j["colorRules"]) {
                if (rule.contains("formula") && rule.contains("color")) {
                    std::string f = rule["formula"];
                    std::string c = rule["color"];
                    ImVec4 colVal = ParseHexColor(c);
                    
                    if (f == "default") {
                        defaultColor = colVal;
                    } else {
                        ColorRule r;
                        r.formula = f;
                        r.colorValue = colVal;
                        r.binding.Compile(f);
                        rules.push_back(r);
                    }
                }
            }
        }
    }

    ImVec4 Evaluate() {
        for (auto& rule : rules) {
            if (rule.binding.Evaluate(0.0f) > 0.5f) {
                return rule.colorValue;
            }
        }
        return defaultColor;
    }
};

// 資料驅動組件結構
struct Component {
    std::string id;
    std::string type;
    float x = 0.0f;
    float y = 0.0f;
    float w = 100.0f;
    float h = 50.0f;
    bool visible = true;
    
    // 文字屬性
    float fontSize = 18.0f;
    std::string align = "left"; // left, center, right
    
    // 進度條屬性
    bool isVertical = false;

    // 表達式綁定
    ExpressionBinding valueBinding;
    ComponentColor colorConfig;
};

// 佈局設定結構
struct CanvasConfig {
    float logicalW = 800.0f;
    float logicalH = 480.0f;
};

// 全局狀態
CanvasConfig       g_CanvasConfig;
std::vector<Component> g_Components;
std::mutex         g_LayoutMutex;
std::wstring       g_LayoutFilePath = L"layout.json";

DXGIOverlayManager g_OverlayManager;
WebSocketClient    g_WSClient;
TelemetryData      g_Telemetry;
std::mutex         g_TelemetryMutex;

// 初始化符號表
void InitSymbolTable() {
    g_SymbolTable.add_variable("rpm", ev_rpm);
    g_SymbolTable.add_variable("maxRpm", ev_maxRpm);
    g_SymbolTable.add_variable("idleRpm", ev_idleRpm);
    g_SymbolTable.add_variable("speed", ev_speed);
    g_SymbolTable.add_variable("gear", ev_gear);
    g_SymbolTable.add_variable("power", ev_power);
    g_SymbolTable.add_variable("boost", ev_boost);
    g_SymbolTable.add_variable("accelX", ev_accelX);
    g_SymbolTable.add_variable("accelY", ev_accelY);
    g_SymbolTable.add_variable("accelZ", ev_accelZ);
    g_SymbolTable.add_variable("yaw", ev_yaw);
    g_SymbolTable.add_variable("pitch", ev_pitch);
    g_SymbolTable.add_variable("roll", ev_roll);

    g_SymbolTable.add_variable("tireTempFL", ev_tireTempFL);
    g_SymbolTable.add_variable("tireTempFR", ev_tireTempFR);
    g_SymbolTable.add_variable("tireTempRL", ev_tireTempRL);
    g_SymbolTable.add_variable("tireTempRR", ev_tireTempRR);

    g_SymbolTable.add_variable("suspTravelFL", ev_suspTravelFL);
    g_SymbolTable.add_variable("suspTravelFR", ev_suspTravelFR);
    g_SymbolTable.add_variable("suspTravelRL", ev_suspTravelRL);
    g_SymbolTable.add_variable("suspTravelRR", ev_suspTravelRR);

    g_SymbolTable.add_variable("slipRatioFL", ev_slipRatioFL);
    g_SymbolTable.add_variable("slipRatioFR", ev_slipRatioFR);
    g_SymbolTable.add_variable("slipRatioRL", ev_slipRatioRL);
    g_SymbolTable.add_variable("slipRatioRR", ev_slipRatioRR);

    g_SymbolTable.add_variable("slipAngleFL", ev_slipAngleFL);
    g_SymbolTable.add_variable("slipAngleFR", ev_slipAngleFR);
    g_SymbolTable.add_variable("slipAngleRL", ev_slipAngleRL);
    g_SymbolTable.add_variable("slipAngleRR", ev_slipAngleRR);

    g_SymbolTable.add_constants();
}

// 同步遙測數值至求值變數
void UpdateExpressionVariables(const TelemetryData& t) {
    ev_rpm = t.currentEngineRpm;
    ev_maxRpm = t.engineMaxRpm;
    ev_idleRpm = t.engineIdleRpm;
    ev_speed = t.speed;
    ev_gear = (float)t.gear;
    ev_power = t.power;
    ev_boost = t.boost;
    ev_accelX = t.accel[0];
    ev_accelY = t.accel[1];
    ev_accelZ = t.accel[2];
    ev_yaw = t.yaw;
    ev_pitch = t.pitch;
    ev_roll = t.roll;
    
    ev_tireTempFL = t.tireTemp[0];
    ev_tireTempFR = t.tireTemp[1];
    ev_tireTempRL = t.tireTemp[2];
    ev_tireTempRR = t.tireTemp[3];

    ev_suspTravelFL = t.suspTravel[0];
    ev_suspTravelFR = t.suspTravel[1];
    ev_suspTravelRL = t.suspTravel[2];
    ev_suspTravelRR = t.suspTravel[3];

    ev_slipRatioFL = t.slipRatio[0];
    ev_slipRatioFR = t.slipRatio[1];
    ev_slipRatioRL = t.slipRatio[2];
    ev_slipRatioRR = t.slipRatio[3];

    ev_slipAngleFL = t.slipAngle[0] * 57.29578f;
    ev_slipAngleFR = t.slipAngle[1] * 57.29578f;
    ev_slipAngleRL = t.slipAngle[2] * 57.29578f;
    ev_slipAngleRR = t.slipAngle[3] * 57.29578f;
}

// 載入與解析 layout.json
void LoadLayoutConfig() {
    std::lock_guard<std::mutex> lock(g_LayoutMutex);
    std::ifstream file(g_LayoutFilePath);
    if (!file.is_open()) return;

    try {
        json j;
        file >> j;
        
        // 載入畫布邏輯寬高
        if (j.contains("canvas")) {
            auto canv = j["canvas"];
            if (canv.contains("w")) g_CanvasConfig.logicalW = canv["w"];
            if (canv.contains("h")) g_CanvasConfig.logicalH = canv["h"];
        }

        // 載入各個組件
        if (j.contains("components")) {
            std::vector<Component> newComponents;
            for (auto& compJson : j["components"]) {
                Component c;
                if (compJson.contains("id")) c.id = compJson["id"];
                if (compJson.contains("type")) c.type = compJson["type"];
                if (compJson.contains("x")) c.x = compJson["x"];
                if (compJson.contains("y")) c.y = compJson["y"];
                if (compJson.contains("w")) c.w = compJson["w"];
                if (compJson.contains("h")) c.h = compJson["h"];
                if (compJson.contains("visible")) c.visible = compJson["visible"];
                
                // 文字屬性
                if (compJson.contains("fontSize")) c.fontSize = compJson["fontSize"];
                if (compJson.contains("align")) c.align = compJson["align"];
                
                // 進度條屬性
                if (compJson.contains("isVertical")) c.isVertical = compJson["isVertical"];

                // 綁定 value 公式
                if (compJson.contains("bindings") && compJson["bindings"].contains("value")) {
                    c.valueBinding.Compile(compJson["bindings"]["value"]);
                }

                // 綁定 color 規則
                if (compJson.contains("bindings") && compJson["bindings"].contains("color")) {
                    c.colorConfig.Parse(compJson["bindings"]["color"]);
                }

                newComponents.push_back(c);
            }
            g_Components = std::move(newComponents);
        }
    }
    catch (const std::exception& e) {
        std::cerr << "[Layout] 解析佈局檔案出錯: " << e.what() << "\n";
    }
}

// 監控設定變更
void TickLayoutMonitor() {
    static DWORD lastTick = 0;
    DWORD currentTick = GetTickCount();
    if (currentTick - lastTick > 1000) {
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
        if (j.contains("SpeedMetersPerSecond")) g_Telemetry.speed = j["SpeedMetersPerSecond"] * 3.6f;
        if (j.contains("Gear")) g_Telemetry.gear = j["Gear"];
        if (j.contains("PowerWatts")) g_Telemetry.power = j["PowerWatts"] / 745.7f;
        if (j.contains("Boost")) g_Telemetry.boost = j["Boost"] / 6894.75729f;

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
        if (j.contains("AccelerationX")) g_Telemetry.accel[0] = j["AccelerationX"] / 9.81f;
        if (j.contains("AccelerationY")) g_Telemetry.accel[1] = j["AccelerationY"] / 9.81f;
        if (j.contains("AccelerationZ")) g_Telemetry.accel[2] = j["AccelerationZ"] / 9.81f;
        if (j.contains("Yaw")) g_Telemetry.yaw = j["Yaw"];
    }
    catch (const std::exception& e) {
        // 忽略格式錯誤
    }
}

// 繪製資料驅動 UI
void RenderTelemetryUI(UINT screenWidth, UINT screenHeight) {
    TelemetryData t;
    {
        std::lock_guard<std::mutex> lock(g_TelemetryMutex);
        t = g_Telemetry;
    }

    // 複製與更新公式引擎變數值
    UpdateExpressionVariables(t);

    std::vector<Component> comps;
    CanvasConfig canv;
    {
        std::lock_guard<std::mutex> lock(g_LayoutMutex);
        comps = g_Components;
        canv = g_CanvasConfig;
    }

    // 1. 計算等比例縮放矩陣
    float scaleX = (float)screenWidth / canv.logicalW;
    float scaleY = (float)screenHeight / canv.logicalH;
    float scale = min(scaleX, scaleY);

    float offsetX = ((float)screenWidth - canv.logicalW * scale) * 0.5f;
    float offsetY = ((float)screenHeight - canv.logicalH * scale) * 0.5f;

    ImDrawList* drawList = ImGui::GetBackgroundDrawList();

    // 2. 遍歷元件進行資料驅動繪製
    for (auto& comp : comps) {
        if (!comp.visible) continue;

        // 計算縮放後的位置大小
        float sx = offsetX + comp.x * scale;
        float sy = offsetY + comp.y * scale;
        float sw = comp.w * scale;
        float sh = comp.h * scale;

        // 獲取當前顏色評估值
        ImVec4 colVec = comp.colorConfig.Evaluate();
        ImU32 col = ImGui::ColorConvertFloat4ToU32(colVec);

        if (comp.type == "Text") {
            float val = comp.valueBinding.Evaluate(0.0f);
            
            // 將浮點數值格式化為字串 (如果值是整數，去小數點)
            char textBuf[64];
            if (val == (int)val) {
                sprintf_s(textBuf, "%d", (int)val);
            } else {
                sprintf_s(textBuf, "%.1f", val);
            }

            // 自定義特殊值輸出（如檔位 0 -> R, 11 -> N）
            if (comp.id == "gear_text" || comp.valueBinding.formula == "gear") {
                int gearInt = (int)val;
                if (gearInt == 0) sprintf_s(textBuf, "R");
                else if (gearInt == 11) sprintf_s(textBuf, "N");
            }

            // 設置字型大小 (使用 ImGui 縮放或直接在 DrawList 用當前字型繪製)
            // 由於 ImGui 不支持繪製時動態縮放字型，我們使用 DrawList 的 AddText 傳入縮放後的 fontSize
            float currentFontSize = comp.fontSize * scale;
            ImFont* font = ImGui::GetFont();
            
            ImVec2 textSize = font->CalcTextSizeA(currentFontSize, FLT_MAX, 0.0f, textBuf);
            ImVec2 textPos = ImVec2(sx, sy);
            
            // 處理水平對齊
            if (comp.align == "center") {
                textPos.x = sx + (sw - textSize.x) * 0.5f;
            } else if (comp.align == "right") {
                textPos.x = sx + sw - textSize.x;
            }
            // 垂直置中
            textPos.y = sy + (sh - textSize.y) * 0.5f;

            drawList->AddText(font, currentFontSize, textPos, col, textBuf);
        }
        else if (comp.type == "ProgressBar") {
            float ratio = comp.valueBinding.Evaluate(0.0f);
            ratio = max(0.0f, min(1.0f, ratio)); // 限制在 0.0 - 1.0 之間

            // 繪製背景邊框
            drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + sw, sy + sh), ImGui::ColorConvertFloat4ToU32(ImVec4(colVec.x, colVec.y, colVec.z, 0.2f)), 4.0f, 0, 1.0f);

            // 繪製填充進度
            if (ratio > 0.01f) {
                ImVec2 fillMin = ImVec2(sx + 2, sy + 2);
                ImVec2 fillMax = ImVec2(sx + sw - 2, sy + sh - 2);

                if (comp.isVertical) {
                    float fillHeight = (sh - 4) * ratio;
                    fillMin.y = sy + sh - 2 - fillHeight;
                } else {
                    fillMax.x = sx + 2 + (sw - 4) * ratio;
                }

                drawList->AddRectFilled(fillMin, fillMax, col, 2.0f);
            }
        }
    }
}

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

    int port = 8000;
    for (int i = 1; i < __argc; ++i) {
        if (wcscmp(__wargv[i], L"-port") == 0 && i + 1 < __argc) {
            port = _wtoi(__wargv[i + 1]);
        }
    }
    std::wstring wsPath = L"/ws/telemetry";
    
    UINT width = GetSystemMetrics(SM_CXSCREEN);
    UINT height = GetSystemMetrics(SM_CYSCREEN);

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

    HWND hWnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TRANSPARENT,
        szWindowClass,
        szTitle,
        WS_POPUP,
        0, 0, width, height,
        nullptr, nullptr, hInstance, nullptr
    );

    if (!hWnd) return FALSE;

    if (!g_OverlayManager.Initialize(hWnd, width, height)) {
        MessageBoxW(nullptr, L"無法初始化 D3D11 與 Overlay 交換鏈。", L"錯誤", MB_ICONERROR);
        return FALSE;
    }

    // 初始化公式符號表
    InitSymbolTable();

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO(); (void)io;
    io.IniFilename = nullptr;

    ImGui::StyleColorsDark();

    ImGui_ImplWin32_Init(hWnd);
    ImGui_ImplDX11_Init(g_OverlayManager.GetDevice(), g_OverlayManager.GetContext());

    // 載入 JSON 佈局
    LoadLayoutConfig();

    std::cout << "[Overlay] 連接後端 WebSocket: 127.0.0.1:" << port << wsPath.c_str() << "...\n";
    g_WSClient.Connect(L"127.0.0.1", port, wsPath, OnWebSocketMessage);

    ShowWindow(hWnd, SW_SHOW);
    UpdateWindow(hWnd);

    MSG msg;
    bool bRunning = true;
    while (bRunning) {
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
            if (msg.message == WM_QUIT) {
                bRunning = false;
            }
        }

        if (!bRunning) break;

        TickLayoutMonitor();

        g_OverlayManager.BeginFrame();

        ImGui_ImplDX11_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        // 渲染資料驅動的 UI，傳入當前視窗寬高
        RenderTelemetryUI(width, height);

        ImGui::Render();
        ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

        g_OverlayManager.EndFrame();

        if (!g_WSClient.IsConnected() && (GetTickCount() % 300 == 0)) {
            g_WSClient.Connect(L"127.0.0.1", port, wsPath, OnWebSocketMessage);
        }
    }

    g_WSClient.Disconnect();
    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    g_OverlayManager.Shutdown();

    return (int)msg.wParam;
}
