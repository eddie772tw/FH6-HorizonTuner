import React from "react";
import ReactDOM from "react-dom/client";
import "halfmoon/css/halfmoon.min.css";
import "halfmoon/css/cores/halfmoon.cores.css";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";

// 1. 全局劫持 fetch 與 WebSocket 以支援動態 port 協商
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let url: string;
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    url = input.url;
  }

  if (url.includes('127.0.0.1:8001') || url.includes('localhost:8001')) {
    const port = (window as any).BACKEND_PORT || 8001;
    const newUrl = url.replace('8001', port.toString());
    
    if (typeof input === 'string') {
      return originalFetch(newUrl, init);
    } else if (input instanceof URL) {
      return originalFetch(new URL(newUrl), init);
    } else {
      const newRequest = new Request(newUrl, input);
      return originalFetch(newRequest);
    }
  }
  return originalFetch(input, init);
};

const OriginalWebSocket = window.WebSocket;
const ProxyWebSocket = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
  let urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.includes('127.0.0.1:8001') || urlStr.includes('localhost:8001')) {
    const port = (window as any).BACKEND_PORT || 8001;
    urlStr = urlStr.replace('8001', port.toString());
  }
  return Reflect.construct(OriginalWebSocket, [urlStr, protocols], ProxyWebSocket);
} as any;

ProxyWebSocket.prototype = OriginalWebSocket.prototype;
ProxyWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
ProxyWebSocket.OPEN = OriginalWebSocket.OPEN;
ProxyWebSocket.CLOSING = OriginalWebSocket.CLOSING;
ProxyWebSocket.CLOSED = OriginalWebSocket.CLOSED;
window.WebSocket = ProxyWebSocket;

// 3. 防 FOUC：在 React 掛載前同步從 localStorage 讀取主題設定並立即套用
// 這確保頁面第一幀已有正確的 data-bs-theme/core 屬性，避免主題閃白
(function applyThemeEarly() {
  try {
    const raw = localStorage.getItem('themeSettings');
    if (raw) {
      const saved = JSON.parse(raw);
      document.documentElement.setAttribute('data-bs-theme', saved.mode || 'dark');
      document.documentElement.setAttribute('data-bs-core', saved.halfmoonCore || 'default');
      if (saved.primaryColor) {
        document.documentElement.style.setProperty('--primary', saved.primaryColor);
      }
      if (saved.secondaryColor) {
        document.documentElement.style.setProperty('--secondary', saved.secondaryColor);
      }
      if (saved.accentColor) {
        document.documentElement.style.setProperty('--accent', saved.accentColor);
      }
    } else {
      // 預設深色模式
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      document.documentElement.setAttribute('data-bs-core', 'default');
    }
  } catch (e) {
    // localStorage 讀取失敗時使用預設值（隱私模式等情況）
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    document.documentElement.setAttribute('data-bs-core', 'default');
  }
})();

// 4. 非同步載入 Port 並啟動 React
async function initApp() {
  let backendPort = 8001;
  try {
    backendPort = await invoke<number>("get_backend_port");
    console.log("Dynamically resolved backend port:", backendPort);
  } catch (e) {
    console.warn("Failed to get backend port from Tauri, using default 8001:", e);
  }
  (window as any).BACKEND_PORT = backendPort;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initApp();
