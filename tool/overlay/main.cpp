#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#elif _WIN32_WINNT < 0x0602
#undef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#endif

#include <windows.h>
#include <iostream>
#include <mutex>
#include <fstream>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>
#include <cmath>
using std::min;
using std::max;

#include <map>
#include <wrl/client.h>

// 引入 stb_image 圖片庫
#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_THREAD_LOCAL // 避免與執行緒相關的連結衝突
#include "stb_image.h"

// ImGui
#include "imgui.h"
#include "imgui_impl_win32.h"
#include "imgui_impl_dx11.h"

// ExprTk
#include <exprtk.hpp>

// 我們的組件
#include "DXGIOverlayManager.h"
#include "WebSocketClient.h"

extern DXGIOverlayManager g_OverlayManager;

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
    float posX = 0.0f;
    float posY = 0.0f;
    float posZ = 0.0f;
};

std::wstring GetExeDirectory() {
    wchar_t buffer[MAX_PATH];
    GetModuleFileNameW(NULL, buffer, MAX_PATH);
    std::wstring path(buffer);
    size_t pos = path.find_last_of(L"\\/");
    if (pos != std::wstring::npos) {
        return path.substr(0, pos);
    }
    return L".";
}

std::string GetExeDirectoryA() {
    std::wstring wdir = GetExeDirectory();
    if (wdir.empty()) return ".";
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wdir[0], (int)wdir.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wdir[0], (int)wdir.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

// 授權校驗預留接口與擴充註解
bool VerifyLicenseStub() {
    // TODO: 商業版將在此整合 ECDSA 非對稱簽章與 HWID 認證機制
    // 預期流程：讀取伺服器發回的數位憑證檔案，使用內置公鑰進行校驗
    return true;
}

std::string DecryptPresetStub(const std::vector<unsigned char>& encryptedData) {
    // TODO: 商業版將在此利用憑證簽章派生 AES-256 解密金鑰，並解密核心預設佈局
    // 避免逆向工程直接 Patch 機器碼跳轉分支繞過授權
    return std::string((char*)encryptedData.data(), encryptedData.size());
}

// 實作加載貼圖到 D3D11 SRV 檢視
bool LoadTextureFromFile(const char* filename, ID3D11Device* device, ID3D11ShaderResourceView** out_srv, int* out_width, int* out_height) {
    int image_width = 0;
    int image_height = 0;
    std::string exeDir = GetExeDirectoryA();
    
    std::vector<std::string> candidates = {
        exeDir + "/assets/hud/" + filename,
        exeDir + "/../assets/hud/" + filename,
        exeDir + "/../../assets/hud/" + filename,
        exeDir + "/../../../assets/hud/" + filename,
        std::string("tool/overlay/assets/hud/") + filename,
        std::string("assets/hud/") + filename,
        filename
    };
    
    unsigned char* image_data = nullptr;
    std::string matchedPath = "";
    for (const auto& path : candidates) {
        image_data = stbi_load(path.c_str(), &image_width, &image_height, NULL, 4);
        if (image_data != nullptr) {
            matchedPath = path;
            break;
        }
    }
    
    if (image_data == NULL) {
        std::cout << "[Overlay] 錯誤：無法載入貼圖檔案 " << filename << " (已嘗試所有候選路徑)\n";
        return false;
    }
    
    std::cout << "[Overlay] 成功載入貼圖 " << filename << " 來自 " << matchedPath << " (" << image_width << "x" << image_height << ")\n";

    D3D11_TEXTURE2D_DESC desc;
    ZeroMemory(&desc, sizeof(desc));
    desc.Width = image_width;
    desc.Height = image_height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    desc.CPUAccessFlags = 0;

    ID3D11Texture2D *pTexture = NULL;
    D3D11_SUBRESOURCE_DATA subResource;
    subResource.pSysMem = image_data;
    subResource.SysMemPitch = desc.Width * 4;
    subResource.SysMemSlicePitch = 0;
    HRESULT hr = device->CreateTexture2D(&desc, &subResource, &pTexture);
    if (FAILED(hr)) {
        stbi_image_free(image_data);
        return false;
    }

    D3D11_SHADER_RESOURCE_VIEW_DESC srvDesc;
    ZeroMemory(&srvDesc, sizeof(srvDesc));
    srvDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    srvDesc.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
    srvDesc.Texture2D.MipLevels = desc.MipLevels;
    srvDesc.Texture2D.MostDetailedMip = 0;
    hr = device->CreateShaderResourceView(pTexture, &srvDesc, out_srv);
    pTexture->Release();

    stbi_image_free(image_data);

    if (FAILED(hr)) return false;

    *out_width = image_width;
    *out_height = image_height;
    return true;
}

// 貼圖緩存與尺寸管理
std::map<std::string, ID3D11ShaderResourceView*> g_TextureCache;
std::map<std::string, ImVec2> g_TextureSizes;

ID3D11ShaderResourceView* GetOrLoadTexture(const std::string& filename, int* width = nullptr, int* height = nullptr) {
    if (filename.empty()) return nullptr;
    auto it = g_TextureCache.find(filename);
    if (it != g_TextureCache.end()) {
        if (width) *width = (int)g_TextureSizes[filename].x;
        if (height) *height = (int)g_TextureSizes[filename].y;
        return it->second;
    }

    ID3D11ShaderResourceView* srv = nullptr;
    int w = 0, h = 0;
    if (LoadTextureFromFile(filename.c_str(), g_OverlayManager.GetDevice(), &srv, &w, &h)) {
        g_TextureCache[filename] = srv;
        g_TextureSizes[filename] = ImVec2((float)w, (float)h);
        if (width) *width = w;
        if (height) *height = h;
        return srv;
    }
    return nullptr;
}

// 旋轉繪製貼圖輔助函數
void DrawRotatedImage(ImDrawList* drawList, ID3D11ShaderResourceView* texture, const ImVec2& pivot, const ImVec2& size, float angleRad, ImU32 col = IM_COL32_WHITE) {
    float cosA = cos(angleRad);
    float sinA = sin(angleRad);

    ImVec2 halfSize(size.x * 0.5f, size.y * 0.5f);
    ImVec2 localPoints[4] = {
        ImVec2(-halfSize.x, -halfSize.y),
        ImVec2(halfSize.x, -halfSize.y),
        ImVec2(halfSize.x, halfSize.y),
        ImVec2(-halfSize.x, halfSize.y)
    };

    ImVec2 screenPoints[4];
    for (int i = 0; i < 4; ++i) {
        screenPoints[i].x = pivot.x + (localPoints[i].x * cosA - localPoints[i].y * sinA);
        screenPoints[i].y = pivot.y + (localPoints[i].x * sinA + localPoints[i].y * cosA);
    }

    drawList->AddImageQuad(
        (ImTextureID)texture,
        screenPoints[0], screenPoints[1], screenPoints[2], screenPoints[3],
        ImVec2(0, 0), ImVec2(1, 0), ImVec2(1, 1), ImVec2(0, 1),
        col
    );
}

// 風格配置
struct StyleConfig {
    std::string dialTexture;
    std::string needleTexture;
    float startAngle;
    float endAngle;
    float pivotX; // 旋轉中心比例 (0.0 - 1.0)
    float pivotY;
};

std::map<std::string, StyleConfig> g_StyleConfigs = {
    { "GT7_RPM", { "res_10_410.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "Defi_Advance_RPM", { "res_10_411.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "Speedhut_RPM", { "res_10_401.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "AltezzaTRD_RPM", { "res_10_257.png", "res_10_408.png", -140.0f, 140.0f, 0.5f, 0.5f } },
    { "NFS2015_RPM", { "res_10_254.png", "res_10_408.png", -120.0f, 120.0f, 0.5f, 0.5f } },
    { "FordGT_Speed", { "res_10_258.png", "res_10_408.png", -120.0f, 120.0f, 0.5f, 0.5f } },
    { "NFS2015_oilpressure", { "res_10_254.png", "res_10_408.png", -90.0f, 90.0f, 0.5f, 0.5f } },
    { "Boost_Gauge", { "res_10_410.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "OilPressure_Gauge", { "res_10_410.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "OilTemp_Gauge", { "res_10_410.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } },
    { "CoolantTemp_Gauge", { "res_10_410.png", "res_10_408.png", -135.0f, 135.0f, 0.5f, 0.5f } }
};

std::map<std::string, std::string> g_StaticTextures = {
    { "AltezzaTRD_Radio", "res_10_312.png" },
    { "NFS2015_Radio", "res_10_311.png" },
    { "FordGT_Radio", "res_10_304.png" },
    { "Defi_Radio", "res_10_313.png" },
    { "AltezzaTRD_Dashboard", "res_10_257.png" },
    { "NFS2015_Dashboard", "res_10_254.png" },
    { "Soarer_Dashboard", "res_10_255.png" },
    { "JZX100_Dashboard", "res_10_256.png" },
    { "AEM_Dashboard", "res_10_250.png" },
    { "FordGT_Dashboard", "res_10_258.png" },
    { "Xbox_Controller", "res_10_500.png" }
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
float ev_posX = 0.0f, ev_posY = 0.0f, ev_posZ = 0.0f;
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
        r = ((colorVal >> 16) & 0xFF) / 255.0f;
        g = ((colorVal >> 8) & 0xFF) / 255.0f;
        b = (colorVal & 0xFF) / 255.0f;
        a = ((colorVal >> 24) & 0xFF) / 255.0f;
    }
    return ImVec4(r, g, b, a);
}

// 條件色彩配置
struct ColorRule {
    std::string formula;
    ImVec4 colorValue = ImVec4(1, 1, 1, 1);
    ExpressionBinding binding;
};

struct ComponentColor {
    ImVec4 defaultColor = ImVec4(1, 1, 1, 1);
    std::vector<ColorRule> rules;

    void Parse(const json& colorJson) {
        rules.clear();
        if (colorJson.is_string()) {
            defaultColor = ParseHexColor(colorJson);
        } else if (colorJson.is_object() && colorJson.contains("colorRules")) {
            for (auto& rule : colorJson["colorRules"]) {
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
    std::string stylePrefix = "";
    std::string texturePath = "";
    float x = 0.0f;
    float y = 0.0f;
    float w = 100.0f;
    float h = 50.0f;
    bool visible = true;
    int zOrder = 0;
    
    // 文字屬性
    float fontSize = 18.0f;
    std::string align = "left"; // left, center, right
    
    // 進度條屬性
    bool isVertical = false;

    // LED 組件屬性
    int ledCount = 10;
    std::string ledShape = "circle"; // "circle", "rect"
    std::string fillDirection = "left_to_right"; // "left_to_right", "right_to_left", "center_out"

    // 旋轉指針屬性
    float pivotX = 50.0f;
    float pivotY = 50.0f;
    float startAngle = -135.0f;
    float endAngle = 135.0f;
    float needleLength = 40.0f;

    // 表達式綁定
    ExpressionBinding valueBinding;
    ComponentColor colorConfig;
};

// Widget 設定結構
struct WidgetConfig {
    bool enabled = false;
    int style = 0;
    int alignment = 2; // 預設右下角
    float scale = 1.0f;
    float opacity = 1.0f;
    float padding_x = 0.0f;
    float padding_y = 0.0f;
    ImVec4 tint = ImVec4(1.0f, 1.0f, 1.0f, 1.0f);
};

// INI 預設佈局結構
struct OverlayPreset {
    std::string name = "Default";
    int previewMode = 0;
    int editMode = 0;
    WidgetConfig controller;
    WidgetConfig radio;
    WidgetConfig dashboard;
    WidgetConfig tacho;
    WidgetConfig boost;
    WidgetConfig oil_pressure;
    WidgetConfig oil_temp;
    WidgetConfig coolant_temp;
    
    // 獨立遙測卡片 Widget
    WidgetConfig tire_temp;
    WidgetConfig susp_travel;
    WidgetConfig slip_limit;
    WidgetConfig g_force;
    WidgetConfig map;

    // 相機抖動效果
    bool camera_shake_enabled = false;
    float camera_shake_intensity = 1.0f;
    float camera_shake_speed = 1.0f;
    bool camera_distortion_enabled = false;
    float camera_distortion_intensity = 1.0f;
};

// 佈局設定結構
struct CanvasConfig {
    float logicalW = 1920.0f;
    float logicalH = 1080.0f;
};

// 全局狀態
CanvasConfig       g_CanvasConfig;
std::vector<Component> g_Components;
std::mutex         g_LayoutMutex;
std::wstring       g_LayoutFilePath = L"layout.ini"; // 改為 layout.ini
std::wstring       g_ResolvedLayoutPath;
OverlayPreset      g_Preset;                         // 儲存解析後的預設配置

// 輕量原生 C++ INI 解析器
std::map<std::string, std::string> ParseIniFile(const std::wstring& filePath) {
    std::map<std::string, std::string> iniData;
    std::ifstream file(filePath);
    if (!file.is_open()) return iniData;

    std::string line;
    while (std::getline(file, line)) {
        // 去除註解
        size_t commentPos = line.find('#');
        if (commentPos != std::string::npos) line = line.substr(0, commentPos);
        commentPos = line.find(';');
        if (commentPos != std::string::npos) line = line.substr(0, commentPos);

        size_t eqPos = line.find('=');
        if (eqPos == std::string::npos) continue;

        std::string key = line.substr(0, eqPos);
        std::string val = line.substr(eqPos + 1);

        // 去除首尾空白字元
        auto trim = [](std::string& s) {
            if (s.empty()) return;
            s.erase(0, s.find_first_not_of(" \t\r\n"));
            size_t idx = s.find_last_not_of(" \t\r\n");
            if (idx != std::string::npos) s.erase(idx + 1);
        };
        trim(key);
        trim(val);

        if (!key.empty()) {
            iniData[key] = val;
        }
    }
    return iniData;
}

// 載入 Widget 個別欄位
void LoadWidgetConfig(const std::map<std::string, std::string>& ini, const std::string& prefix, WidgetConfig& config) {
    if (ini.count(prefix + "_widget_enabled")) {
        config.enabled = (ini.at(prefix + "_widget_enabled") == "1" || ini.at(prefix + "_widget_enabled") == "true");
    } else {
        config.enabled = false;
    }
    if (ini.count(prefix + "_widget")) {
        config.style = std::stoi(ini.at(prefix + "_widget"));
    } else {
        config.style = 0;
    }
    if (ini.count(prefix + "_alignment")) {
        config.alignment = std::stoi(ini.at(prefix + "_alignment"));
    } else {
        config.alignment = 2;
    }
    if (ini.count(prefix + "_scale")) {
        config.scale = std::stof(ini.at(prefix + "_scale"));
    } else {
        config.scale = 1.0f;
    }
    if (ini.count(prefix + "_opacity")) {
        config.opacity = std::stof(ini.at(prefix + "_opacity"));
    } else {
        config.opacity = 0.9f;
    }
    if (ini.count(prefix + "_padding_x")) {
        config.padding_x = std::stof(ini.at(prefix + "_padding_x"));
    } else {
        config.padding_x = 0.0f;
    }
    if (ini.count(prefix + "_padding_y")) {
        config.padding_y = std::stof(ini.at(prefix + "_padding_y"));
    } else {
        config.padding_y = 0.0f;
    }
    if (ini.count(prefix + "_widget_tint")) {
        std::stringstream ss(ini.at(prefix + "_widget_tint"));
        std::string val;
        float c[4] = { 1.0f, 1.0f, 1.0f, 1.0f };
        int idx = 0;
        while (std::getline(ss, val, ',') && idx < 4) {
            c[idx++] = std::stof(val);
        }
        config.tint = ImVec4(c[0], c[1], c[2], c[3]);
    } else {
        config.tint = ImVec4(1.0f, 1.0f, 1.0f, 1.0f);
    }
}

// 地圖路徑軌跡
std::vector<ImVec2> g_MapPath;
std::mutex g_MapPathMutex;
DWORD g_LastTelemetryTime = 0;

// 全域鍵盤 Hook
HHOOK g_KeyboardHook = nullptr;
HWND g_MainWindow = nullptr;

LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)) {
        KBDLLHOOKSTRUCT* kb = (KBDLLHOOKSTRUCT*)lParam;
        
        // Caps Lock (0x14) 用於切換 UI 穿透與滑鼠交互狀態
        if (kb->vkCode == VK_CAPITAL) {
            PostMessageW(g_MainWindow, 0x8001, 100, 0);
        }
    }
    return CallNextHookEx(g_KeyboardHook, nCode, wParam, lParam);
}

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
    g_SymbolTable.add_variable("posX", ev_posX);
    g_SymbolTable.add_variable("posY", ev_posY);
    g_SymbolTable.add_variable("posZ", ev_posZ);

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
    ev_posX = t.posX;
    ev_posY = t.posY;
    ev_posZ = t.posZ;
    
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
// 載入與解析 layout.ini
void LoadLayoutConfig() {
    std::lock_guard<std::mutex> lock(g_LayoutMutex);
    
    if (g_ResolvedLayoutPath.empty()) {
        std::wstring exeDir = GetExeDirectory();
        std::vector<std::wstring> candidates = {
            exeDir + L"\\layout.ini",
            exeDir + L"\\..\\layout.ini",
            exeDir + L"\\..\\..\\layout.ini",
            exeDir + L"\\..\\..\\..\\layout.ini",
            g_LayoutFilePath,
            L"layout.ini"
        };
        for (const auto& p : candidates) {
            std::ifstream f(p);
            if (f.good()) {
                g_ResolvedLayoutPath = p;
                break;
            }
        }
        if (g_ResolvedLayoutPath.empty()) {
            g_ResolvedLayoutPath = L"layout.ini";
        }
        std::wcout << L"[Layout] 成功解析 layout.ini 實體路徑: " << g_ResolvedLayoutPath << std::endl;
    }

    std::map<std::string, std::string> ini = ParseIniFile(g_ResolvedLayoutPath);
    if (ini.empty()) return;

    if (ini.count("name")) g_Preset.name = ini["name"];
    if (ini.count("preview_mode")) {
        g_Preset.previewMode = std::stoi(ini["preview_mode"]);
    } else {
        g_Preset.previewMode = 0;
    }
    if (ini.count("edit_mode")) {
        g_Preset.editMode = std::stoi(ini["edit_mode"]);
    } else {
        g_Preset.editMode = 0;
    }

    LoadWidgetConfig(ini, "controller", g_Preset.controller);
    LoadWidgetConfig(ini, "radio", g_Preset.radio);
    LoadWidgetConfig(ini, "dashboard", g_Preset.dashboard);
    LoadWidgetConfig(ini, "tacho", g_Preset.tacho);
    LoadWidgetConfig(ini, "boost", g_Preset.boost);
    LoadWidgetConfig(ini, "oil_pressure", g_Preset.oil_pressure);
    LoadWidgetConfig(ini, "oil_temp", g_Preset.oil_temp);
    LoadWidgetConfig(ini, "coolant_temp", g_Preset.coolant_temp);

    LoadWidgetConfig(ini, "tire_temp", g_Preset.tire_temp);
    LoadWidgetConfig(ini, "susp_travel", g_Preset.susp_travel);
    LoadWidgetConfig(ini, "slip_limit", g_Preset.slip_limit);
    LoadWidgetConfig(ini, "g_force", g_Preset.g_force);
    LoadWidgetConfig(ini, "map", g_Preset.map);

    if (ini.count("camera_shake_enabled")) {
        g_Preset.camera_shake_enabled = (ini["camera_shake_enabled"] == "1" || ini["camera_shake_enabled"] == "true");
    } else {
        g_Preset.camera_shake_enabled = false;
    }
    if (ini.count("camera_shake_intensity")) {
        g_Preset.camera_shake_intensity = std::stof(ini["camera_shake_intensity"]);
    } else {
        g_Preset.camera_shake_intensity = 1.0f;
    }
    if (ini.count("camera_shake_speed")) {
        g_Preset.camera_shake_speed = std::stof(ini["camera_shake_speed"]);
    } else {
        g_Preset.camera_shake_speed = 1.0f;
    }

    if (ini.count("camera_distortion_enabled")) {
        g_Preset.camera_distortion_enabled = (ini["camera_distortion_enabled"] == "1" || ini["camera_distortion_enabled"] == "true");
    } else {
        g_Preset.camera_distortion_enabled = false;
    }
    if (ini.count("camera_distortion_intensity")) {
        g_Preset.camera_distortion_intensity = std::stof(ini["camera_distortion_intensity"]);
    } else {
        g_Preset.camera_distortion_intensity = 1.0f;
    }

    std::vector<int> passOrder;
    if (ini.count("pass_order")) {
        std::stringstream ss(ini.at("pass_order"));
        std::string val;
        while (std::getline(ss, val, ',')) {
            try {
                passOrder.push_back(std::stoi(val));
            } catch (...) {}
        }
    }

    std::vector<Component> newComponents;
    
    auto addCompFromWidget = [&](const std::string& id, const std::string& type, const std::string& stylePrefix, WidgetConfig& config, const std::string& formula) {
        if (!config.enabled) return;

        float base_w = 100.0f;
        float base_h = 100.0f;

        if (id == "dashboard") { base_w = 350.0f; base_h = 175.0f; }
        else if (id == "tacho") { base_w = 150.0f; base_h = 150.0f; }
        else if (id == "radio") {
            if (config.style == 0) { base_w = 200.0f; base_h = 52.0f; }
            else if (config.style == 1) { base_w = 220.0f; base_h = 53.0f; }
            else if (config.style == 2) { base_w = 70.0f; base_h = 72.0f; }
            else if (config.style == 5) { base_w = 100.0f; base_h = 50.0f; }
            else { base_w = 150.0f; base_h = 60.0f; }
        }
        else if (id == "controller") { base_w = 250.0f; base_h = 62.0f; }
        else if (id == "boost") { base_w = 80.0f; base_h = 80.0f; }
        else if (id == "oil_pressure") { base_w = 80.0f; base_h = 80.0f; }
        else if (id == "oil_temp") { base_w = 80.0f; base_h = 80.0f; }
        else if (id == "coolant_temp") { base_w = 80.0f; base_h = 80.0f; }
        else if (id == "tire_temp") { base_w = 220.0f; base_h = 180.0f; }
        else if (id == "susp_travel") { base_w = 220.0f; base_h = 180.0f; }
        else if (id == "slip_limit") { base_w = 220.0f; base_h = 180.0f; }
        else if (id == "g_force") { base_w = 180.0f; base_h = 180.0f; }
        else if (id == "map") { base_w = 200.0f; base_h = 200.0f; }
        else if (id.find("needle") != std::string::npos) {
            base_w = 350.0f;
            base_h = 175.0f;
        }

        float w = base_w * config.scale;
        float h = base_h * config.scale;

        float canvas_w = g_CanvasConfig.logicalW;
        float canvas_h = g_CanvasConfig.logicalH;
        float x = 0.0f;
        float y = 0.0f;

        if (config.alignment == 0) { // Top-Left
            x = config.padding_x;
            y = config.padding_y;
        } else if (config.alignment == 1) { // Bottom-Center
            x = (canvas_w - w) * 0.5f + config.padding_x;
            y = canvas_h - h - config.padding_y;
        } else if (config.alignment == 2) { // Bottom-Right
            x = canvas_w - w - config.padding_x;
            y = canvas_h - h - config.padding_y;
        } else if (config.alignment == 3) { // Bottom-Left
            x = config.padding_x;
            y = canvas_h - h - config.padding_y;
        } else {
            x = config.padding_x;
            y = config.padding_y;
        }

        Component c;
        c.id = id;
        c.type = type;
        c.stylePrefix = stylePrefix;
        c.x = x;
        c.y = y;
        c.w = w;
        c.h = h;
        c.visible = true;

        if (type == "Needle") {
            auto it = g_StyleConfigs.find(stylePrefix);
            if (it != g_StyleConfigs.end()) {
                c.pivotX = it->second.pivotX * base_w;
                c.pivotY = it->second.pivotY * base_h;
                c.startAngle = it->second.startAngle;
                c.endAngle = it->second.endAngle;
                c.needleLength = min(base_w, base_h) * 0.45f;
            }
        }

        if (!formula.empty()) {
            c.valueBinding.Compile(formula);
        }

        newComponents.push_back(c);
    };

    std::string dbPrefixes[6] = { "AEM_Dashboard", "NFS2015_Dashboard", "Soarer_Dashboard", "JZX100_Dashboard", "AltezzaTRD_Dashboard", "FordGT_Dashboard" };
    std::string dbPrefix = (g_Preset.dashboard.style >= 0 && g_Preset.dashboard.style < 6) ? dbPrefixes[g_Preset.dashboard.style] : "AEM_Dashboard";

    std::string tachoPrefixes[6] = { "GT7_RPM", "Defi_Advance_RPM", "Speedhut_RPM", "AltezzaTRD_RPM", "NFS2015_RPM", "FordGT_Speed" };
    std::string tachoPrefix = (g_Preset.tacho.style >= 0 && g_Preset.tacho.style < 6) ? tachoPrefixes[g_Preset.tacho.style] : "GT7_RPM";

    std::string radioPrefixes[6] = { "FordGT_Radio", "NFS2015_Radio", "AltezzaTRD_Radio", "", "", "Defi_Radio" };
    std::string radioPrefix = (g_Preset.radio.style >= 0 && g_Preset.radio.style < 6) ? radioPrefixes[g_Preset.radio.style] : "FordGT_Radio";

    addCompFromWidget("dashboard", "Image", dbPrefix, g_Preset.dashboard, "");
    
    // 自動生成內建儀表板的指針
    if (g_Preset.dashboard.enabled) {
        if (g_Preset.dashboard.style == 1) { // NFS 2015
            WidgetConfig needleConfig = g_Preset.dashboard;
            addCompFromWidget("dashboard_rpm_needle", "Needle", "NFS2015_RPM", needleConfig, "(rpm - idleRpm) / (maxRpm - idleRpm)");
        }
        else if (g_Preset.dashboard.style == 4) { // Altezza TRD
            WidgetConfig needleConfig = g_Preset.dashboard;
            addCompFromWidget("dashboard_rpm_needle", "Needle", "AltezzaTRD_RPM", needleConfig, "(rpm - idleRpm) / (maxRpm - idleRpm)");
        }
        else if (g_Preset.dashboard.style == 5) { // Ford GT
            WidgetConfig needleConfig = g_Preset.dashboard;
            addCompFromWidget("dashboard_speed_needle", "Needle", "FordGT_Speed", needleConfig, "speed / 300.0");
        }
    }

    addCompFromWidget("tacho", "Gauge", tachoPrefix, g_Preset.tacho, "(rpm - idleRpm) / (maxRpm - idleRpm)");
    addCompFromWidget("radio", "Radio", radioPrefix, g_Preset.radio, "");
    addCompFromWidget("controller", "Controller", "Xbox_Controller", g_Preset.controller, "");
    addCompFromWidget("boost", "Gauge", "Boost_Gauge", g_Preset.boost, "boost");
    addCompFromWidget("oil_pressure", "Gauge", "OilPressure_Gauge", g_Preset.oil_pressure, "oilPressure");
    addCompFromWidget("oil_temp", "Gauge", "OilTemp_Gauge", g_Preset.oil_temp, "oilTemp");
    addCompFromWidget("coolant_temp", "Gauge", "CoolantTemp_Gauge", g_Preset.coolant_temp, "coolantTemp");

    addCompFromWidget("tire_temp", "TireTempCard", "TireTemp_Card", g_Preset.tire_temp, "");
    addCompFromWidget("susp_travel", "SuspTravelCard", "SuspTravel_Card", g_Preset.susp_travel, "");
    addCompFromWidget("slip_limit", "SlipLimitCard", "SlipLimit_Card", g_Preset.slip_limit, "");
    addCompFromWidget("g_force", "GForceCard", "GForce_Card", g_Preset.g_force, "");
    addCompFromWidget("map", "MapCard", "Map_Card", g_Preset.map, "");

    // Z-Order 還原排序
    auto getWidgetTypeIndex = [](const std::string& id) -> int {
        if (id == "controller") return 0;
        if (id == "map") return 1;
        if (id == "radio") return 2;
        if (id == "dashboard") return 3;
        if (id == "tacho" || id == "dashboard_rpm_needle" || id == "dashboard_speed_needle") return 4;
        if (id == "boost") return 5;
        if (id == "oil_pressure") return 6;
        if (id == "oil_temp") return 7;
        if (id == "coolant_temp") return 8;
        if (id == "tire_temp") return 9;
        if (id == "susp_travel") return 10;
        if (id == "slip_limit") return 11;
        if (id == "g_force") return 12;
        return 99;
    };

    for (auto& comp : newComponents) {
        int idx = getWidgetTypeIndex(comp.id);
        auto it = std::find(passOrder.begin(), passOrder.end(), idx);
        if (it != passOrder.end()) {
            comp.zOrder = (int)std::distance(passOrder.begin(), it);
        } else {
            comp.zOrder = idx;
        }
    }

    std::sort(newComponents.begin(), newComponents.end(), [](const Component& a, const Component& b) {
        return a.zOrder < b.zOrder;
    });

    g_Components = std::move(newComponents);
}

#pragma pack(push, 1)
struct BinaryTelemetryPacket {
    int isRaceOn;
    float currentEngineRpm;
    float engineMaxRpm;
    float engineIdleRpm;
    float speed;
    int gear;
    float power;
    float boost;
    float accel[3];
    float yaw;
    float pitch;
    float roll;
    float tireTemp[4];
    float suspTravel[4];
    float slipRatio[4];
    float slipAngle[4];
    float posX;
    float posY;
    float posZ;
    char reserved[4];
};
#pragma pack(pop)

// 監控設定變更
void TickLayoutMonitor() {
    static DWORD lastTick = 0;
    static FILETIME lastWriteTime = { 0, 0 };
    DWORD currentTick = GetTickCount();

    if (currentTick - lastTick > 2000) { // 每 2 秒檢查一次，減少 I/O
        lastTick = currentTick;

        WIN32_FILE_ATTRIBUTE_DATA fileInfo;
        std::wstring monitorPath = g_ResolvedLayoutPath.empty() ? g_LayoutFilePath : g_ResolvedLayoutPath;
        if (GetFileAttributesExW(monitorPath.c_str(), GetFileExInfoStandard, &fileInfo)) {
            if (fileInfo.ftLastWriteTime.dwLowDateTime != lastWriteTime.dwLowDateTime ||
                fileInfo.ftLastWriteTime.dwHighDateTime != lastWriteTime.dwHighDateTime) {
                
                std::cout << "[Layout] 偵測到排版檔案變更，重新讀取...\n";
                LoadLayoutConfig();
                lastWriteTime = fileInfo.ftLastWriteTime;
            }
        }
    }
}

// WebSocket 訊息回調
void OnWebSocketMessage(const void* data, size_t len, bool isBinary) {
    try {
        std::lock_guard<std::mutex> lock(g_TelemetryMutex);
        g_LastTelemetryTime = GetTickCount();

        if (isBinary) {
            if (len == sizeof(BinaryTelemetryPacket)) {
                const BinaryTelemetryPacket* packet = reinterpret_cast<const BinaryTelemetryPacket*>(data);
                g_Telemetry.isRaceOn = packet->isRaceOn == 1;
                g_Telemetry.currentEngineRpm = packet->currentEngineRpm;
                g_Telemetry.engineMaxRpm = packet->engineMaxRpm;
                g_Telemetry.engineIdleRpm = packet->engineIdleRpm;
                g_Telemetry.speed = packet->speed;
                g_Telemetry.gear = packet->gear;
                g_Telemetry.power = packet->power;
                g_Telemetry.boost = packet->boost;
                g_Telemetry.accel[0] = packet->accel[0];
                g_Telemetry.accel[1] = packet->accel[1];
                g_Telemetry.accel[2] = packet->accel[2];
                g_Telemetry.yaw = packet->yaw;
                g_Telemetry.pitch = packet->pitch;
                g_Telemetry.roll = packet->roll;
                for (int i = 0; i < 4; ++i) {
                    g_Telemetry.tireTemp[i] = packet->tireTemp[i];
                    g_Telemetry.suspTravel[i] = packet->suspTravel[i];
                    g_Telemetry.slipRatio[i] = packet->slipRatio[i];
                    // 在 Python 端已經轉成了度，所以這裡不需要重複乘以 57.29578f
                    // 為了使 slipAngle 符合 UpdateExpressionVariables，將其直接賦值
                    g_Telemetry.slipAngle[i] = packet->slipAngle[i] / 57.29578f; 
                }
                g_Telemetry.posX = packet->posX;
                g_Telemetry.posY = packet->posY;
                g_Telemetry.posZ = packet->posZ;
            }
        } else {
            // 保留原有 JSON 相容解析方式
            std::string msg(reinterpret_cast<const char*>(data), len);
            json j = json::parse(msg);

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
            if (j.contains("PositionX")) g_Telemetry.posX = j["PositionX"];
            if (j.contains("PositionY")) g_Telemetry.posY = j["PositionY"];
            if (j.contains("PositionZ")) g_Telemetry.posZ = j["PositionZ"];
        }
    }
    catch (const std::exception& e) {
        // 忽略格式錯誤
    }
}

// 1. Tire Temp Card Widget 繪製
void DrawTireTempCard(ImDrawList* drawList, float sx, float sy, float w, float h, float scale) {
    drawList->AddRectFilled(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(10, 15, 20, 200), 8.0f * scale);
    drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(255, 255, 255, 30), 8.0f * scale, 0, 1.0f);
    drawList->AddText(nullptr, 14.0f * scale, ImVec2(sx + 10 * scale, sy + 8 * scale), IM_COL32(0, 240, 255, 255), "TIRE TEMP");

    float temps[4] = { ev_tireTempFL, ev_tireTempFR, ev_tireTempRL, ev_tireTempRR };
    const char* labels[4] = { "FL", "FR", "RL", "RR" };

    auto getTireCol = [](float tempF) {
        float tempC = (tempF - 32.0f) * 5.0f / 9.0f;
        if (tempF < 150.0f || tempC < 65.0f) return IM_COL32(0, 136, 255, 220); // Cold
        if (tempF > 210.0f || tempC > 99.0f) return IM_COL32(255, 0, 60, 220);  // Hot
        return IM_COL32(0, 255, 80, 220);                                     // Normal
    };

    float boxW = (w - 30.0f * scale) * 0.5f;
    float boxH = (h - 45.0f * scale) * 0.5f;

    for (int i = 0; i < 4; ++i) {
        int col = i % 2;
        int row = i / 2;
        float bx = sx + 10.0f * scale + col * (boxW + 10.0f * scale);
        float by = sy + 30.0f * scale + row * (boxH + 8.0f * scale);

        drawList->AddRectFilled(ImVec2(bx, by), ImVec2(bx + boxW, by + boxH), getTireCol(temps[i]), 4.0f * scale);
        char buf[32];
        sprintf_s(buf, "%s: %.0f F", labels[i], temps[i]);
        drawList->AddText(nullptr, 12.0f * scale, ImVec2(bx + 6.0f * scale, by + (boxH - 12.0f * scale) * 0.5f), IM_COL32_WHITE, buf);
    }
}

// 2. Suspension Travel Card Widget 繪製
void DrawSuspTravelCard(ImDrawList* drawList, float sx, float sy, float w, float h, float scale) {
    drawList->AddRectFilled(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(10, 15, 20, 200), 8.0f * scale);
    drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(255, 255, 255, 30), 8.0f * scale, 0, 1.0f);
    drawList->AddText(nullptr, 14.0f * scale, ImVec2(sx + 10 * scale, sy + 8 * scale), IM_COL32(0, 240, 255, 255), "SUSP TRAVEL");

    float travels[4] = { ev_suspTravelFL, ev_suspTravelFR, ev_suspTravelRL, ev_suspTravelRR };
    const char* labels[4] = { "FL", "FR", "RL", "RR" };

    float barW = (w - 50.0f * scale) / 4.0f;
    float maxBarH = h - 55.0f * scale;

    for (int i = 0; i < 4; ++i) {
        float bx = sx + 10.0f * scale + i * (barW + 10.0f * scale);
        float by = sy + 30.0f * scale;

        drawList->AddRectFilled(ImVec2(bx, by), ImVec2(bx + barW, by + maxBarH), IM_COL32(30, 40, 50, 255), 2.0f * scale);

        float ratio = travels[i];
        if (ratio < 0.0f) ratio = 0.0f;
        if (ratio > 1.0f) ratio = 1.0f;
        float barH = maxBarH * ratio;

        drawList->AddRectFilled(ImVec2(bx, by + maxBarH - barH), ImVec2(bx + barW, by + maxBarH), IM_COL32(0, 240, 255, 255), 2.0f * scale);
        
        drawList->AddText(nullptr, 10.0f * scale, ImVec2(bx + 1.0f * scale, by + maxBarH + 2.0f * scale), IM_COL32(180, 200, 220, 255), labels[i]);
    }
}

// 3. Slip Limit Card Widget 繪製
void DrawSlipLimitCard(ImDrawList* drawList, float sx, float sy, float w, float h, float scale) {
    drawList->AddRectFilled(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(10, 15, 20, 200), 8.0f * scale);
    drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(255, 255, 255, 30), 8.0f * scale, 0, 1.0f);
    drawList->AddText(nullptr, 14.0f * scale, ImVec2(sx + 10 * scale, sy + 8 * scale), IM_COL32(0, 240, 255, 255), "SLIP STATUS");

    float ratios[4] = { ev_slipRatioFL, ev_slipRatioFR, ev_slipRatioRL, ev_slipRatioRR };
    float angles[4] = { ev_slipAngleFL, ev_slipAngleFR, ev_slipAngleRL, ev_slipAngleRR };
    const char* labels[4] = { "FL", "FR", "RL", "RR" };

    float textY = sy + 30.0f * scale;
    float rowH = (h - 40.0f * scale) / 4.0f;

    for (int i = 0; i < 4; ++i) {
        float y = textY + i * rowH;
        bool isSlipping = (abs(ratios[i]) > 0.3f || abs(angles[i]) > 5.0f);
        ImU32 textCol = isSlipping ? IM_COL32(255, 50, 80, 255) : IM_COL32(230, 240, 255, 255);

        char buf[64];
        sprintf_s(buf, "%s: R %.2f | A %.1f", labels[i], ratios[i], angles[i]);
        drawList->AddText(nullptr, 12.0f * scale, ImVec2(sx + 12 * scale, y), textCol, buf);
    }
}

// 4. G-Force Card Widget 繪製
void DrawGForceCard(ImDrawList* drawList, float sx, float sy, float w, float h, float scale) {
    drawList->AddRectFilled(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(10, 15, 20, 200), 8.0f * scale);
    drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(255, 255, 255, 30), 8.0f * scale, 0, 1.0f);
    drawList->AddText(nullptr, 14.0f * scale, ImVec2(sx + 10 * scale, sy + 8 * scale), IM_COL32(0, 240, 255, 255), "G-FORCE RADAR");

    ImVec2 center(sx + w * 0.5f, sy + h * 0.55f);
    float radarRadius = min(w, h) * 0.35f;

    drawList->AddLine(ImVec2(center.x - radarRadius, center.y), ImVec2(center.x + radarRadius, center.y), IM_COL32(255, 255, 255, 45), 1.0f);
    drawList->AddLine(ImVec2(center.x, center.y - radarRadius), ImVec2(center.x, center.y + radarRadius), IM_COL32(255, 255, 255, 45), 1.0f);
    drawList->AddCircle(center, radarRadius * 0.5f, IM_COL32(255, 255, 255, 35), 32, 1.0f);
    drawList->AddCircle(center, radarRadius, IM_COL32(255, 255, 255, 65), 32, 1.0f);

    float latG = ev_accelX / 9.81f;
    float lonG = ev_accelZ / 9.81f;

    float dx = latG * radarRadius / 1.5f;
    float dy = lonG * radarRadius / 1.5f;

    float dist = sqrt(dx * dx + dy * dy);
    if (dist > radarRadius) {
        dx = (dx / dist) * radarRadius;
        dy = (dy / dist) * radarRadius;
    }

    ImVec2 dotPos(center.x + dx, center.y + dy);
    drawList->AddCircleFilled(dotPos, 5.0f * scale, IM_COL32(0, 240, 255, 255));
    drawList->AddCircle(dotPos, 8.0f * scale, IM_COL32(0, 240, 255, 100), 16, 1.5f * scale);
}

// 5. 地圖卡片 Widget 繪製
void DrawMapCard(ImDrawList* drawList, float sx, float sy, float w, float h, float scale) {
    drawList->AddRectFilled(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(10, 15, 20, 200), 8.0f * scale);
    drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + w, sy + h), IM_COL32(255, 255, 255, 30), 8.0f * scale, 0, 1.0f);
    drawList->AddText(nullptr, 14.0f * scale, ImVec2(sx + 10 * scale, sy + 8 * scale), IM_COL32(0, 240, 255, 255), "TRACK MAP");

    std::lock_guard<std::mutex> pathLock(g_MapPathMutex);
    if (g_MapPath.size() >= 2) {
        float minX = FLT_MAX, maxX = -FLT_MAX, minY = FLT_MAX, maxY = -FLT_MAX;
        for (const auto& p : g_MapPath) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        float pathW = maxX - minX;
        float pathH = maxY - minY;
        float maxDim = max(pathW, pathH);
        if (maxDim < 1.0f) maxDim = 1.0f;

        float margin = 20.0f * scale;
        float drawW = w - margin * 2.0f;
        float drawH = h - margin * 2.0f - 15.0f * scale;
        float mapScale = min(drawW, drawH) / maxDim;

        ImVec2 center(sx + w * 0.5f, sy + 15.0f * scale + h * 0.5f);
        auto mapToScreen = [&](const ImVec2& p) {
            float lx = (p.x - (minX + maxX) * 0.5f) * mapScale;
            float ly = (p.y - (minY + maxY) * 0.5f) * mapScale;
            return ImVec2(center.x + lx, center.y + ly);
        };

        for (size_t i = 0; i < g_MapPath.size() - 1; ++i) {
            drawList->AddLine(mapToScreen(g_MapPath[i]), mapToScreen(g_MapPath[i+1]), IM_COL32(0, 240, 255, 200), 2.0f * scale);
        }

        // 繪製車載位置
        ImVec2 carPos = mapToScreen(ImVec2(ev_posX, ev_posZ));
        drawList->AddCircleFilled(carPos, 5.0f * scale, IM_COL32(255, 50, 80, 255));
        drawList->AddCircle(carPos, 8.0f * scale, IM_COL32(255, 50, 80, 100), 16, 1.5f * scale);
    }
}

// 繪製資料驅動 UI
void RenderTelemetryUI(UINT screenWidth, UINT screenHeight) {
    TelemetryData t;
    {
        std::lock_guard<std::mutex> lock(g_TelemetryMutex);
        t = g_Telemetry;
    }

    // 1. 不再檢查 isRaceOn，始終渲染 HUD

    // 判斷遙測訊號是否活躍 (2秒內收到過資料)
    bool isTelemetryActive = (GetTickCount() - g_LastTelemetryTime < 2000);

    // 複製與更新公式引擎變數值 (預覽模式下若無實時遙測，載入模擬測試資料)
    if (g_Preset.previewMode == 1 && !isTelemetryActive) {
        TelemetryData mockT;
        mockT.isRaceOn = true;
        mockT.currentEngineRpm = 5200.0f;
        mockT.engineMaxRpm = 8000.0f;
        mockT.engineIdleRpm = 1000.0f;
        mockT.speed = 120.0f;
        mockT.gear = 4;
        mockT.tireTemp[0] = 165.0f; mockT.tireTemp[1] = 168.0f;
        mockT.tireTemp[2] = 180.0f; mockT.tireTemp[3] = 182.0f;
        mockT.suspTravel[0] = 0.45f; mockT.suspTravel[1] = 0.48f;
        mockT.suspTravel[2] = 0.52f; mockT.suspTravel[3] = 0.50f;
        mockT.slipRatio[0] = 0.05f; mockT.slipRatio[1] = 0.08f;
        mockT.slipRatio[2] = 0.12f; mockT.slipRatio[3] = 0.10f;
        mockT.slipAngle[0] = 0.8f; mockT.slipAngle[1] = 0.9f;
        mockT.slipAngle[2] = 1.2f; mockT.slipAngle[3] = 1.1f;
        mockT.accel[0] = 4.5f; mockT.accel[1] = 0.0f; mockT.accel[2] = -3.2f;
        mockT.boost = 12.5f;
        UpdateExpressionVariables(mockT);
    } else {
        UpdateExpressionVariables(t);
    }

    // 記錄地圖軌跡
    static ImVec2 lastPos(0.0f, 0.0f);
    if (isTelemetryActive && t.isRaceOn) {
        std::lock_guard<std::mutex> pathLock(g_MapPathMutex);
        float dx = t.posX - lastPos.x;
        float dy = t.posZ - lastPos.y;
        if (g_MapPath.empty() || (dx * dx + dy * dy > 2.0f)) {
            g_MapPath.push_back(ImVec2(t.posX, t.posZ));
            lastPos = ImVec2(t.posX, t.posZ);
            if (g_MapPath.size() > 2000) {
                g_MapPath.erase(g_MapPath.begin());
            }
        }
    } else if (g_Preset.previewMode == 1 && !isTelemetryActive) {
        std::lock_guard<std::mutex> pathLock(g_MapPathMutex);
        if (g_MapPath.empty()) {
            for (int i = 0; i < 100; ++i) {
                float angle = i * (3.14159265f * 2.0f / 100.0f);
                float r = 50.0f;
                g_MapPath.push_back(ImVec2(r * cos(angle), r * sin(angle)));
            }
        }
    } else {
        std::lock_guard<std::mutex> pathLock(g_MapPathMutex);
        g_MapPath.clear();
    }

    CanvasConfig canv;
    ImDrawList* drawList = ImGui::GetBackgroundDrawList();

    std::lock_guard<std::mutex> lock(g_LayoutMutex);
    canv = g_CanvasConfig;

    // 2. 處理相機震動 (Camera Shake) 與相機扭曲脈衝縮放 (Camera Distortion)
    float shakeX = 0.0f;
    float shakeY = 0.0f;
    float pulseScale = 1.0f;

    if (g_Preset.camera_shake_enabled) {
        float timeSec = GetTickCount() * 0.001f * g_Preset.camera_shake_speed;
        
        float rpmRatio = ev_rpm / (ev_maxRpm > 0.0f ? ev_maxRpm : 6000.0f);
        if (rpmRatio < 0.0f) rpmRatio = 0.0f;
        if (rpmRatio > 1.0f) rpmRatio = 1.0f;
        float vibe = rpmRatio * rpmRatio * 2.0f;

        float accelMag = sqrt(ev_accelX * ev_accelX + ev_accelY * ev_accelY + ev_accelZ * ev_accelZ) / 9.81f;
        if (accelMag > 1.0f) vibe += (accelMag - 1.0f) * 4.0f;

        shakeX = sin(timeSec * 35.0f) * vibe * g_Preset.camera_shake_intensity;
        shakeY = cos(timeSec * 31.0f) * vibe * g_Preset.camera_shake_intensity;
    }

    if (g_Preset.camera_distortion_enabled) {
        float accelMag = sqrt(ev_accelX * ev_accelX + ev_accelY * ev_accelY + ev_accelZ * ev_accelZ) / 9.81f;
        if (accelMag > 1.0f) {
            pulseScale = 1.0f + (accelMag - 1.0f) * 0.03f * g_Preset.camera_distortion_intensity;
        }
    }

    // 3. 計算等比例縮放矩陣
    float scaleX = (float)screenWidth / canv.logicalW;
    float scaleY = (float)screenHeight / canv.logicalH;
    float scale = min(scaleX, scaleY) * pulseScale;

    float offsetX = ((float)screenWidth - canv.logicalW * scale) * 0.5f + shakeX;
    float offsetY = ((float)screenHeight - canv.logicalH * scale) * 0.5f + shakeY;

    // 4. 遍歷元件進行資料驅動繪製
    for (auto& comp : g_Components) {
        if (!comp.visible) continue;

        // 計算縮放後的位置大小
        float sx = offsetX + comp.x * scale;
        float sy = offsetY + comp.y * scale;
        float sw = comp.w * scale;
        float sh = comp.h * scale;

        // 如果在編輯定位模式，繪製虛線定位邊框與標籤描述
        if (g_Preset.editMode == 1) {
            drawList->AddRect(ImVec2(sx, sy), ImVec2(sx + sw, sy + sh), IM_COL32(0, 240, 255, 200), 0.0f, 0, 1.5f * scale);
            char lbl[128];
            sprintf_s(lbl, "%s (Scale: %.2f)", comp.id.c_str(), scale / pulseScale);
            drawList->AddText(nullptr, 11.0f * scale, ImVec2(sx + 2.0f * scale, sy + 2.0f * scale), IM_COL32(0, 240, 255, 255), lbl);
        }

        // 獲取當前顏色評估值
        ImVec4 colVec = comp.colorConfig.Evaluate();
        ImU32 col = ImGui::ColorConvertFloat4ToU32(colVec);

        if (comp.type == "TireTempCard") {
            DrawTireTempCard(drawList, sx, sy, sw, sh, scale);
        }
        else if (comp.type == "SuspTravelCard") {
            DrawSuspTravelCard(drawList, sx, sy, sw, sh, scale);
        }
        else if (comp.type == "SlipLimitCard") {
            DrawSlipLimitCard(drawList, sx, sy, sw, sh, scale);
        }
        else if (comp.type == "GForceCard") {
            DrawGForceCard(drawList, sx, sy, sw, sh, scale);
        }
        else if (comp.type == "MapCard") {
            DrawMapCard(drawList, sx, sy, sw, sh, scale);
        }
        else if (comp.type == "Text") {
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
        else if (comp.type == "LEDGroup") {
            float ratio = comp.valueBinding.Evaluate(0.0f);
            ratio = max(0.0f, min(1.0f, ratio));

            int count = comp.ledCount;
            int litCount = (int)(ratio * count);

            // 閃爍提醒 (超過 96% 紅線)
            bool isFlashing = false;
            if (ratio > 0.96f) {
                isFlashing = (GetTickCount() / 100) % 2 == 0;
            }

            float padding = 4.0f * scale;
            float totalSpacing = padding * (count - 1);
            float ledW = (sw - totalSpacing) / count;
            float ledH = sh;

            for (int i = 0; i < count; ++i) {
                float lx = sx + i * (ledW + padding);
                float ly = sy;

                bool isLit = false;
                if (comp.fillDirection == "left_to_right") {
                    isLit = i < litCount;
                } else if (comp.fillDirection == "right_to_left") {
                    isLit = (count - 1 - i) < litCount;
                } else if (comp.fillDirection == "center_out") {
                    int mid = count / 2;
                    int offset = abs(i - mid);
                    isLit = (offset * 2) < litCount;
                }

                ImVec4 ledColor = ImVec4(0.15f, 0.15f, 0.15f, 1.0f); // 未亮暗灰色
                if (isLit) {
                    if (isFlashing) {
                        ledColor = ImVec4(1.0f, 0.0f, 0.0f, 1.0f);
                    } else {
                        float ledRatio = (float)i / count;
                        if (ledRatio < 0.6f) {
                            ledColor = ImVec4(0.0f, 1.0f, 0.2f, 1.0f); // 綠
                        } else if (ledRatio < 0.8f) {
                            ledColor = ImVec4(1.0f, 0.7f, 0.0f, 1.0f); // 黃
                        } else {
                            ledColor = ImVec4(1.0f, 0.0f, 0.0f, 1.0f); // 紅
                        }
                    }
                }

                ImU32 ledColU32 = ImGui::ColorConvertFloat4ToU32(ledColor);

                if (comp.ledShape == "circle") {
                    float radius = min(ledW, ledH) * 0.5f;
                    ImVec2 center = ImVec2(lx + ledW * 0.5f, ly + ledH * 0.5f);
                    drawList->AddCircleFilled(center, radius, IM_COL32(20, 20, 20, 200));
                    drawList->AddCircleFilled(center, radius - 1.0f, ledColU32);

                    if (isLit) {
                        drawList->AddCircle(center, radius + 2.0f, ImGui::ColorConvertFloat4ToU32(ImVec4(ledColor.x, ledColor.y, ledColor.z, 0.25f)), 32, 2.0f);
                    }
                } else {
                    drawList->AddRectFilled(ImVec2(lx, ly), ImVec2(lx + ledW, ly + ledH), ledColU32, 2.0f);
                    if (isLit) {
                        drawList->AddRect(ImVec2(lx - 1.0f, ly - 1.0f), ImVec2(lx + ledW + 1.0f, ly + ledH + 1.0f), ImGui::ColorConvertFloat4ToU32(ImVec4(ledColor.x, ledColor.y, ledColor.z, 0.25f)), 2.0f, 0, 1.5f);
                    }
                }
            }
        }
        else if (comp.type == "Needle") {
            float ratio = comp.valueBinding.Evaluate(0.0f);
            ratio = max(0.0f, min(1.0f, ratio));

            float spx = sx + comp.pivotX * scale;
            float spy = sy + comp.pivotY * scale;

            float angle = comp.startAngle + ratio * (comp.endAngle - comp.startAngle);
            float rad = angle * (3.14159265f / 180.0f);
            float length = comp.needleLength * scale;

            std::string needleFile = "";
            if (!comp.texturePath.empty()) {
                needleFile = comp.texturePath;
            } else if (!comp.stylePrefix.empty()) {
                auto it = g_StyleConfigs.find(comp.stylePrefix);
                if (it != g_StyleConfigs.end()) {
                    needleFile = it->second.needleTexture;
                }
            }

            if (!needleFile.empty()) {
                ID3D11ShaderResourceView* needleTex = GetOrLoadTexture(needleFile);
                if (needleTex) {
                    DrawRotatedImage(drawList, needleTex, ImVec2(spx, spy), ImVec2(length * 2.0f, length * 2.0f), rad);
                }
            } else {
                // 繪製針尾 (配重效果)
                float tailLength = length * 0.15f;
                float tailX = spx - tailLength * cos(rad);
                float tailY = spy - tailLength * sin(rad);
                drawList->AddLine(ImVec2(spx, spy), ImVec2(tailX, tailY), IM_COL32(120, 120, 120, 255), 2.0f * scale);

                // 繪製指針主線
                float endX = spx + length * cos(rad);
                float endY = spy + length * sin(rad);
                drawList->AddLine(ImVec2(spx, spy), ImVec2(endX, endY), col, 3.0f * scale);

                // 繪製中心針蓋
                float capRadius = length * 0.12f;
                drawList->AddCircleFilled(ImVec2(spx, spy), capRadius, IM_COL32(30, 30, 30, 255));
                drawList->AddCircle(ImVec2(spx, spy), capRadius, IM_COL32(100, 100, 100, 255), 32, 1.0f);
            }
        }
        else if (comp.type == "Image" || comp.type == "Radio" || comp.type == "Controller") {
            std::string texFile = "";
            if (!comp.texturePath.empty()) {
                texFile = comp.texturePath;
            } else if (!comp.stylePrefix.empty()) {
                auto it = g_StaticTextures.find(comp.stylePrefix);
                if (it != g_StaticTextures.end()) {
                    texFile = it->second;
                }
            }
            if (!texFile.empty()) {
                ID3D11ShaderResourceView* tex = GetOrLoadTexture(texFile);
                if (tex) {
                    drawList->AddImage((ImTextureID)tex, ImVec2(sx, sy), ImVec2(sx + sw, sy + sh));
                }
            }
        }
        else if (comp.type == "Gauge") {
            auto it = g_StyleConfigs.find(comp.stylePrefix);
            if (it != g_StyleConfigs.end()) {
                StyleConfig config = it->second;

                // 1. 繪製錶盤底圖
                ID3D11ShaderResourceView* dialTex = GetOrLoadTexture(config.dialTexture);
                if (dialTex) {
                    drawList->AddImage((ImTextureID)dialTex, ImVec2(sx, sy), ImVec2(sx + sw, sy + sh));
                }

                // 2. 獲取數值與計算旋轉角度
                float ratio = comp.valueBinding.Evaluate(0.0f);
                ratio = max(0.0f, min(1.0f, ratio));
                float angle = config.startAngle + ratio * (config.endAngle - config.startAngle);
                float rad = angle * (3.14159265f / 180.0f);

                // 3. 繪製指針貼圖
                ID3D11ShaderResourceView* needleTex = GetOrLoadTexture(config.needleTexture);
                if (needleTex) {
                    float spx = sx + config.pivotX * sw;
                    float spy = sy + config.pivotY * sh;
                    float needleLen = comp.needleLength > 0.0f ? comp.needleLength * scale : min(sw, sh) * 0.45f;
                    DrawRotatedImage(drawList, needleTex, ImVec2(spx, spy), ImVec2(needleLen * 2.0f, needleLen * 2.0f), rad);
                }
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
    case 0x8001: // WM_TOGGLE_PASSTHROUGH
        if (wParam == 1) { // 切換顯示/隱藏
            static bool visible = true;
            visible = !visible;
            ShowWindow(hWnd, visible ? SW_SHOW : SW_HIDE);
        }
        else if (wParam == 100) { // 切換滑鼠穿透狀態
            LONG_PTR exStyle = GetWindowLongPtr(hWnd, GWL_EXSTYLE);
            if (exStyle & WS_EX_TRANSPARENT) {
                SetWindowLongPtr(hWnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
            } else {
                SetWindowLongPtr(hWnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
            }
            SetWindowPos(hWnd, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        }
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

    // 建立日誌資料夾並將 std::cout / std::cerr / std::wcout / std::wcerr 導向 logs/overlay.log
    CreateDirectoryA("logs", NULL);
    static std::ofstream cppLogFile("logs/overlay.log", std::ios::app);
    static std::wofstream cppWLogFile("logs/overlay.log", std::ios::app);
    std::streambuf* oldCout = std::cout.rdbuf(cppLogFile.rdbuf());
    std::streambuf* oldCerr = std::cerr.rdbuf(cppLogFile.rdbuf());
    std::wstreambuf* oldWCout = std::wcout.rdbuf(cppWLogFile.rdbuf());
    std::wstreambuf* oldWCerr = std::wcerr.rdbuf(cppWLogFile.rdbuf());

    // 啟用自動 flush (unitbuf)
    std::cout << std::unitbuf;
    std::cerr << std::unitbuf;
    std::wcout << std::unitbuf;
    std::wcerr << std::unitbuf;

    std::cout << "\n========================================\n";
    std::cout << "[Overlay] C++ 重疊層程式啟動...\n";

    // 預留授權校驗接口
    if (!VerifyLicenseStub()) {
        MessageBoxW(nullptr, L"授權驗證失敗。", L"錯誤", MB_ICONERROR);
        return FALSE;
    }

    int port = 8000;
    for (int i = 1; i < __argc; ++i) {
        if (wcscmp(__wargv[i], L"-port") == 0 && i + 1 < __argc) {
            port = _wtoi(__wargv[i + 1]);
        }
    }
    std::wstring wsPath = L"/ws/telemetry/binary";
    
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

    g_MainWindow = hWnd;
    g_KeyboardHook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, hInstance, 0);

    if (!g_OverlayManager.Initialize(hWnd, width, height)) {
        if (g_KeyboardHook) UnhookWindowsHookEx(g_KeyboardHook);
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

    if (g_KeyboardHook) {
        UnhookWindowsHookEx(g_KeyboardHook);
    }

    g_WSClient.Disconnect();
    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    g_OverlayManager.Shutdown();

    return (int)msg.wParam;
}
