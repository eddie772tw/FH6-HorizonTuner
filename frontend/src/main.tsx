import React from "react";
import ReactDOM from "react-dom/client";
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

  const backendPort = (window as any).BACKEND_PORT || 8000;
  let targetUrl = url;

  if (url.startsWith('/api')) {
    targetUrl = `http://127.0.0.1:${backendPort}${url}`;
  } else if (url.startsWith('/ws')) {
    targetUrl = `ws://127.0.0.1:${backendPort}${url}`;
  } else if (url.includes('127.0.0.1:8001') || url.includes('localhost:8001') || url.includes('127.0.0.1:8000') || url.includes('localhost:8000')) {
    targetUrl = url.replace(/8001|8000/, backendPort.toString());
  }

  if (typeof input === 'string') {
    return originalFetch(targetUrl, init);
  } else if (input instanceof URL) {
    return originalFetch(new URL(targetUrl), init);
  } else {
    const newRequest = new Request(targetUrl, input);
    return originalFetch(newRequest);
  }
};

const OriginalWebSocket = window.WebSocket;
const ProxyWebSocket = function (url: string | URL, protocols?: string | string[]) {
  let urlStr = typeof url === 'string' ? url : url.toString();
  const backendPort = (window as any).BACKEND_PORT || 8000;
  if (urlStr.startsWith('/ws')) {
    urlStr = `ws://127.0.0.1:${backendPort}${urlStr}`;
  } else if (urlStr.includes('127.0.0.1:8001') || urlStr.includes('localhost:8001') || urlStr.includes('127.0.0.1:8000') || urlStr.includes('localhost:8000')) {
    urlStr = urlStr.replace(/8001|8000/, backendPort.toString());
  }
  return new OriginalWebSocket(urlStr, protocols);
} as any;

ProxyWebSocket.prototype = OriginalWebSocket.prototype;
ProxyWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
ProxyWebSocket.OPEN = OriginalWebSocket.OPEN;
ProxyWebSocket.CLOSING = OriginalWebSocket.CLOSING;
ProxyWebSocket.CLOSED = OriginalWebSocket.CLOSED;
window.WebSocket = ProxyWebSocket;


// 2. 非同步載入 Port 並啟動 React
async function initApp() {
  let backendPort = 8000;
  try {
    backendPort = await invoke<number>("get_backend_port");
    console.log("Dynamically resolved backend port:", backendPort);
  } catch (e) {
    console.warn("Failed to get backend port from Tauri, using default 8000:", e);
  }
  (window as any).BACKEND_PORT = backendPort;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initApp();

