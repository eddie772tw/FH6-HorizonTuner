#pragma once

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#elif _WIN32_WINNT < 0x0602
#undef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#endif

#include <windows.h>
#include <winhttp.h>
#include <string>
#include <vector>
#include <thread>
#include <functional>
#include <iostream>

#pragma comment(lib, "winhttp.lib")

class WebSocketClient {
private:
    HINTERNET m_hSession = nullptr;
    HINTERNET m_hConnect = nullptr;
    HINTERNET m_hRequest = nullptr;
    HINTERNET m_hWebSocket = nullptr;
    bool m_connected = false;
    std::thread m_receiveThread;
    std::function<void(const void* data, size_t len, bool isBinary)> m_onMessage;

public:
    WebSocketClient() = default;
    ~WebSocketClient() { Disconnect(); }

    bool Connect(const std::wstring& host, WORD port, const std::wstring& path, std::function<void(const void* data, size_t len, bool isBinary)> onMessage) {
        m_onMessage = onMessage;
        
        m_hSession = WinHttpOpen(L"HorizonTunerOverlay/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!m_hSession) return false;

        m_hConnect = WinHttpConnect(m_hSession, host.c_str(), port, 0);
        if (!m_hConnect) return false;

        m_hRequest = WinHttpOpenRequest(m_hConnect, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
        if (!m_hRequest) return false;

        // 升級連線為 WebSocket
        if (!WinHttpSetOption(m_hRequest, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, nullptr, 0)) {
            WinHttpCloseHandle(m_hRequest);
            m_hRequest = nullptr;
            return false;
        }

        if (!WinHttpSendRequest(m_hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
            WinHttpCloseHandle(m_hRequest);
            m_hRequest = nullptr;
            return false;
        }

        if (!WinHttpReceiveResponse(m_hRequest, nullptr)) {
            WinHttpCloseHandle(m_hRequest);
            m_hRequest = nullptr;
            return false;
        }

        m_hWebSocket = WinHttpWebSocketCompleteUpgrade(m_hRequest, 0);
        if (!m_hWebSocket) {
            WinHttpCloseHandle(m_hRequest);
            m_hRequest = nullptr;
            return false;
        }

        // 連線成功，關閉原 Request handle (此時由 WebSocket 控制)
        WinHttpCloseHandle(m_hRequest);
        m_hRequest = nullptr;

        m_connected = true;
        m_receiveThread = std::thread(&WebSocketClient::ReceiveLoop, this);
        return true;
    }

    void Disconnect() {
        m_connected = false;
        if (m_hWebSocket) {
            WinHttpWebSocketClose(m_hWebSocket, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, nullptr, 0);
            WinHttpCloseHandle(m_hWebSocket);
            m_hWebSocket = nullptr;
        }
        if (m_hConnect) {
            WinHttpCloseHandle(m_hConnect);
            m_hConnect = nullptr;
        }
        if (m_hSession) {
            WinHttpCloseHandle(m_hSession);
            m_hSession = nullptr;
        }
        if (m_receiveThread.joinable()) {
            m_receiveThread.join();
        }
    }

    bool IsConnected() const { return m_connected; }

private:
    void ReceiveLoop() {
        std::vector<char> buffer(512);
        std::vector<char> messageCollector;

        while (m_connected) {
            DWORD bytesRead = 0;
            WINHTTP_WEB_SOCKET_BUFFER_TYPE bufferType;
            HRESULT hr = WinHttpWebSocketReceive(m_hWebSocket, buffer.data(), (DWORD)buffer.size(), &bytesRead, &bufferType);
            if (FAILED(hr) || bytesRead == 0) {
                std::cerr << "[WebSocket] 接收錯誤或連線中斷。HRESULT: " << hr << "\n";
                m_connected = false;
                break;
            }

            messageCollector.insert(messageCollector.end(), buffer.data(), buffer.data() + bytesRead);

            if (bufferType == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE) {
                if (m_onMessage) {
                    m_onMessage(messageCollector.data(), messageCollector.size(), false);
                }
                messageCollector.clear();
            } else if (bufferType == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE) {
                if (m_onMessage) {
                    m_onMessage(messageCollector.data(), messageCollector.size(), true);
                }
                messageCollector.clear();
            } else if (bufferType == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) {
                std::cout << "[WebSocket] 伺服器要求關閉連線。\n";
                m_connected = false;
                break;
            }
        }
    }
};
