#include "DXGIOverlayManager.h"
#include <iostream>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

bool DXGIOverlayManager::Initialize(HWND hWnd, UINT width, UINT height) {
    m_hWnd = hWnd;
    m_width = width;
    m_height = height;

    Shutdown();

    // 1. 檢查登錄檔是否停用 MPO
    if (IsMPODisabledByRegistry()) {
        std::cout << "[Overlay] MPO 已被登錄檔手動關閉，啟用降級方案 B。\n";
        return SetupSoftwareFallback(width, height);
    }

    // 2. 初始化 D3D11 裝置
    if (!InitD3D11()) {
        std::cerr << "[Overlay] 初始化 D3D11 失敗。\n";
        return false;
    }

    // 3. 檢測硬體與輸出端是否支援 MPO Overlay 及其 HDR 狀態
    bool hardwareSupported = false;
    bool enableHDR = false;
    if (CheckHardwareOverlaySupport(hardwareSupported, enableHDR)) {
        if (hardwareSupported) {
            std::cout << "[Overlay] 硬體支援 MPO，HDR 狀態: " << (enableHDR ? "開啟" : "關閉") << "。初始化 DXGI 前景層 Overlay。\n";
            if (InitHardwareOverlay(width, height, enableHDR)) {
                m_currentMode = OverlayMode::HardwareMPO;
                m_isHDR = enableHDR;
                return true;
            }
        }
    }

    // 4. 若硬體不支援或初始化失敗，自動降級至方案 B
    std::cout << "[Overlay] 硬體不支援 MPO 或初始化失敗，降級至方案 B。\n";
    return SetupSoftwareFallback(width, height);
}

void DXGIOverlayManager::BeginFrame() {
    if (m_currentMode == OverlayMode::HardwareMPO && m_hWaitableObject) {
        // 等待 GPU 準備好排程訊號，大幅降低延遲
        WaitForSingleObject(m_hWaitableObject, INFINITE);
    }

    if (!m_pd3dContext || !m_pRenderTargetView) return;

    // 清理畫布為完全透明
    float clearColor[4] = { 0.0f, 0.0f, 0.0f, 0.0f }; // Alpha 必須為 0 以保證背景透明
    m_pd3dContext->ClearRenderTargetView(m_pRenderTargetView.Get(), clearColor);
    m_pd3dContext->OMSetRenderTargets(1, m_pRenderTargetView.GetAddressOf(), nullptr);
}

void DXGIOverlayManager::EndFrame() {
    if (!m_pSwapChain) return;

    // 1 = 啟用 V-Sync
    HRESULT hr = m_pSwapChain->Present(1, 0);
    if (FAILED(hr)) {
        if (hr == DXGI_ERROR_DEVICE_REMOVED || hr == DXGI_ERROR_DEVICE_RESET) {
            std::cerr << "[Overlay] 顯示卡裝置遺失，重新初始化中...\n";
            Initialize(m_hWnd, m_width, m_height);
        }
    }
}

void DXGIOverlayManager::Shutdown() {
    if (m_hWaitableObject) {
        CloseHandle(m_hWaitableObject);
        m_hWaitableObject = nullptr;
    }
    m_pRenderTargetView.Reset();
    m_pSwapChain2.Reset();
    m_pSwapChain.Reset();
    m_pd3dContext.Reset();
    m_pd3dDevice.Reset();
    m_pDxgiFactory.Reset();
    m_currentMode = OverlayMode::None;
    m_isHDR = false;
}

void DXGIOverlayManager::OnWindowMoved() {
    if (m_currentMode == OverlayMode::None || !m_hWnd) return;

    bool hardwareSupported = false;
    bool enableHDR = false;
    if (CheckHardwareOverlaySupport(hardwareSupported, enableHDR)) {
        // 如果當前是 MPO，但移動到的新螢幕不支援 MPO，則降級
        if (m_currentMode == OverlayMode::HardwareMPO && !hardwareSupported) {
            std::cout << "[Overlay] 檢測到視窗移動至不支援 MPO 的螢幕，自動降級至方案 B。\n";
            Initialize(m_hWnd, m_width, m_height);
        }
        // 如果當前是方案 B，但移動到的新螢幕支援 MPO，且玩家並未在登錄檔禁用，則可嘗試升級回 MPO
        else if (m_currentMode == OverlayMode::SoftwareTopmost && hardwareSupported && !IsMPODisabledByRegistry()) {
            std::cout << "[Overlay] 檢測到視窗移動至支援 MPO 的螢幕，嘗試重新啟用硬體 MPO。\n";
            Initialize(m_hWnd, m_width, m_height);
        }
        // 如果 HDR 狀態改變，也需要重新初始化以套用正確的色彩空間
        else if (m_currentMode == OverlayMode::HardwareMPO && m_isHDR != enableHDR) {
            std::cout << "[Overlay] 檢測到 HDR 狀態變更，重新初始化以對齊色彩空間。\n";
            Initialize(m_hWnd, m_width, m_height);
        }
    }
}

bool DXGIOverlayManager::IsMPODisabledByRegistry() {
    HKEY hKey;
    DWORD value = 0;
    DWORD size = sizeof(DWORD);
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows\\Dwm", 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        RegQueryValueExW(hKey, L"OverlayTestMode", nullptr, nullptr, (LPBYTE)&value, &size);
        RegCloseKey(hKey);
    }
    return (value == 5); // OverlayTestMode = 5 代表 MPO 被強行停用
}

bool DXGIOverlayManager::InitD3D11() {
    D3D_FEATURE_LEVEL featureLevels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0 };
    D3D_FEATURE_LEVEL actualFeatureLevel;

    HRESULT hr = D3D11CreateDevice(
        nullptr,                    // 預設適配器
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, // 啟用 BGRA 支援以適配 Direct2D/DWM/ImGui
        featureLevels,
        _countof(featureLevels),
        D3D11_SDK_VERSION,
        &m_pd3dDevice,
        &actualFeatureLevel,
        &m_pd3dContext
    );

    if (FAILED(hr)) return false;

    ComPtr<IDXGIDevice> pDxgiDevice;
    hr = m_pd3dDevice.As(&pDxgiDevice);
    if (FAILED(hr)) return false;

    ComPtr<IDXGIAdapter> pAdapter;
    hr = pDxgiDevice->GetAdapter(&pAdapter);
    if (FAILED(hr)) return false;

    hr = pAdapter->GetParent(IID_PPV_ARGS(&m_pDxgiFactory));
    return SUCCEEDED(hr);
}

bool DXGIOverlayManager::CheckHardwareOverlaySupport(bool& outSupported, bool& outHDR) {
    outSupported = false;
    outHDR = false;

    if (!m_pDxgiFactory || !m_hWnd) return false;

    // 1. 獲取視窗當前所在的 HMONITOR
    HMONITOR hMonitor = MonitorFromWindow(m_hWnd, MONITOR_DEFAULTTONEAREST);

    // 2. 遍歷適配器與輸出，尋找匹配該 HMONITOR 的 IDXGIOutput
    ComPtr<IDXGIAdapter> pAdapter;
    ComPtr<IDXGIOutput> pTargetOutput;

    for (UINT adapterIndex = 0; m_pDxgiFactory->EnumAdapters(adapterIndex, &pAdapter) != DXGI_ERROR_NOT_FOUND; ++adapterIndex) {
        ComPtr<IDXGIOutput> pOutput;
        for (UINT outputIndex = 0; pAdapter->EnumOutputs(outputIndex, &pOutput) != DXGI_ERROR_NOT_FOUND; ++outputIndex) {
            DXGI_OUTPUT_DESC desc;
            if (SUCCEEDED(pOutput->GetDesc(&desc))) {
                if (desc.Monitor == hMonitor) {
                    pTargetOutput = pOutput;
                    break;
                }
            }
        }
        if (pTargetOutput) break;
    }

    // 若找不到，使用主螢幕 (第一個適配器的第一個輸出)
    if (!pTargetOutput) {
        if (FAILED(m_pDxgiFactory->EnumAdapters(0, &pAdapter))) return false;
        if (FAILED(pAdapter->EnumOutputs(0, &pTargetOutput))) return false;
    }

    // 3. 轉換至 IDXGIOutput3 進行 Overlay 支援檢測
    ComPtr<IDXGIOutput3> pOutput3;
    if (SUCCEEDED(pTargetOutput.As(&pOutput3))) {
        UINT flags = 0;
        // 檢測當前顯示輸出在 BGRA 格式下是否支援硬體 Overlay
        HRESULT hr = pOutput3->CheckOverlaySupport(DXGI_FORMAT_B8G8R8A8_UNORM, m_pd3dDevice.Get(), &flags);
        if (SUCCEEDED(hr) && flags != 0) {
            outSupported = true;
        }
    }

    // 4. 轉換至 IDXGIOutput6 進行 HDR 狀態檢查
    ComPtr<IDXGIOutput6> pOutput6;
    if (SUCCEEDED(pTargetOutput.As(&pOutput6))) {
        DXGI_OUTPUT_DESC1 desc1;
        if (SUCCEEDED(pOutput6->GetDesc1(&desc1))) {
            if (desc1.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020) {
                outHDR = true;
            }
        }
    }

    return true;
}

bool DXGIOverlayManager::InitHardwareOverlay(UINT width, UINT height, bool enableHDR) {
    DXGI_SWAP_CHAIN_DESC1 swapChainDesc = {};
    swapChainDesc.Width = width;
    swapChainDesc.Height = height;
    // HDR 模式下使用 R16G16B16A16_FLOAT，SDR 下使用高相容的 B8G8R8A8_UNORM
    swapChainDesc.Format = enableHDR ? DXGI_FORMAT_R16G16B16A16_FLOAT : DXGI_FORMAT_B8G8R8A8_UNORM;
    swapChainDesc.Stereo = FALSE;
    swapChainDesc.SampleDesc.Count = 1;
    swapChainDesc.SampleDesc.Quality = 0;
    swapChainDesc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    swapChainDesc.BufferCount = 2; // 雙緩衝
    swapChainDesc.Scaling = DXGI_SCALING_STRETCH;
    swapChainDesc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL; // 必須是 Flip 模型
    swapChainDesc.AlphaMode = DXGI_ALPHA_MODE_PREMULTIPLIED;     // 預乘 Alpha 透明處理
    
    // 前景層覆蓋與 Waitable Object
    swapChainDesc.Flags = DXGI_SWAP_CHAIN_FLAG_FOREGROUND_LAYER | 
                          DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT;

    HRESULT hr = m_pDxgiFactory->CreateSwapChainForHwnd(
        m_pd3dDevice.Get(),
        m_hWnd,
        &swapChainDesc,
        nullptr,
        nullptr,
        &m_pSwapChain
    );

    if (FAILED(hr)) return false;

    // 設定最大渲染延遲為 1 幀並取得可等待物件
    if (SUCCEEDED(m_pSwapChain.As(&m_pSwapChain2))) {
        m_pSwapChain2->SetMaximumFrameLatency(1);
        m_hWaitableObject = m_pSwapChain2->GetFrameLatencyWaitableObject();
    }

    // HDR 色彩空間特殊設置
    if (enableHDR) {
        ComPtr<IDXGISwapChain3> swapChain3;
        if (SUCCEEDED(m_pSwapChain.As(&swapChain3))) {
            swapChain3->SetColorSpace1(DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020);
        }
    }

    return CreateRenderTargets();
}

bool DXGIOverlayManager::SetupSoftwareFallback(UINT width, UINT height) {
    // 設置無邊框、置頂、滑鼠穿透與分層樣式
    SetWindowLong(m_hWnd, GWL_EXSTYLE, WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_LAYERED);
    SetWindowLong(m_hWnd, GWL_STYLE, WS_POPUP);
    
    // 設定透明度混色
    SetLayeredWindowAttributes(m_hWnd, RGB(0, 0, 0), 0, LWA_COLORKEY);
    SetWindowPos(m_hWnd, HWND_TOPMOST, 0, 0, width, height, SWP_SHOWWINDOW);

    if (!m_pd3dDevice) {
        if (!InitD3D11()) return false;
    }

    DXGI_SWAP_CHAIN_DESC1 swapChainDesc = {};
    swapChainDesc.Width = width;
    swapChainDesc.Height = height;
    swapChainDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    swapChainDesc.SampleDesc.Count = 1;
    swapChainDesc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    swapChainDesc.BufferCount = 1;
    swapChainDesc.Scaling = DXGI_SCALING_STRETCH;
    swapChainDesc.SwapEffect = DXGI_SWAP_EFFECT_DISCARD; // 使用傳統 DISCARD 模式以支援 LWA_COLORKEY 黑底透空
    swapChainDesc.AlphaMode = DXGI_ALPHA_MODE_IGNORE;          // 由分層視窗處理透明

    HRESULT hr = m_pDxgiFactory->CreateSwapChainForHwnd(
        m_pd3dDevice.Get(),
        m_hWnd,
        &swapChainDesc,
        nullptr,
        nullptr,
        &m_pSwapChain
    );

    if (FAILED(hr)) return false;

    m_currentMode = OverlayMode::SoftwareTopmost;
    return CreateRenderTargets();
}

bool DXGIOverlayManager::CreateRenderTargets() {
    ComPtr<ID3D11Texture2D> pBackBuffer;
    HRESULT hr = m_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&pBackBuffer));
    if (FAILED(hr)) return false;

    hr = m_pd3dDevice->CreateRenderTargetView(pBackBuffer.Get(), nullptr, &m_pRenderTargetView);
    return SUCCEEDED(hr);
}
