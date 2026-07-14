#pragma once

#include <windows.h>
#include <d3d11.h>
#include <dxgi1_6.h>
#include <wrl/client.h>

using Microsoft::WRL::ComPtr;

class DXGIOverlayManager {
public:
    enum class OverlayMode {
        None,
        HardwareMPO,         // 方案 A：硬體多平面疊加 (最適)
        SoftwareTopmost      // 方案 B：傳統透明置頂視窗 (相容模式)
    };

private:
    HWND m_hWnd = nullptr;
    OverlayMode m_currentMode = OverlayMode::None;
    UINT m_width = 0;
    UINT m_height = 0;
    bool m_isHDR = false;

    // DX11 & DXGI 資源
    ComPtr<ID3D11Device>        m_pd3dDevice;
    ComPtr<ID3D11DeviceContext> m_pd3dContext;
    ComPtr<IDXGIFactory5>       m_pDxgiFactory;
    ComPtr<IDXGISwapChain1>     m_pSwapChain;
    ComPtr<IDXGISwapChain2>     m_pSwapChain2; // 用於 Waitable Object
    HANDLE                      m_hWaitableObject = nullptr;

    // 渲染目標
    ComPtr<ID3D11RenderTargetView> m_pRenderTargetView;

public:
    DXGIOverlayManager() = default;
    ~DXGIOverlayManager() { Shutdown(); }

    // 初始化 Overlay，自動選擇最佳相容模式
    bool Initialize(HWND hWnd, UINT width, UINT height);

    // 開始繪製，清理畫布
    void BeginFrame();

    // 結束繪製並呈顯
    void EndFrame();

    // 清理與釋放資源
    void Shutdown();

    // 獲取當前渲染模式
    OverlayMode GetCurrentMode() const { return m_currentMode; }

    // 獲取 D3D 裝置與上下文，便於 ImGui 初始化
    ID3D11Device* GetDevice() const { return m_pd3dDevice.Get(); }
    ID3D11DeviceContext* GetContext() const { return m_pd3dContext.Get(); }
    ID3D11RenderTargetView* GetRenderTargetView() const { return m_pRenderTargetView.Get(); }

    // 當視窗移動到其他顯示器時調用，檢查是否需要動態切換模式
    void OnWindowMoved();

    // 取得當前 HDR 狀態
    bool IsHDR() const { return m_isHDR; }

private:
    bool IsMPODisabledByRegistry();
    bool InitD3D11();
    bool CheckHardwareOverlaySupport(bool& outSupported, bool& outHDR);
    bool InitHardwareOverlay(UINT width, UINT height, bool enableHDR);
    bool SetupSoftwareFallback(UINT width, UINT height);
    bool CreateRenderTargets();
};
