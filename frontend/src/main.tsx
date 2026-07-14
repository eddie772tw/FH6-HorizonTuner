import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";

// 1. 全局劫持 fetch 以支援動態 port 協商
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let url = typeof input === 'string' ? input : input.toString();
  if (url.includes('127.0.0.1:8001') || url.includes('localhost:8001')) {
    const port = (window as any).BACKEND_PORT || 8001;
    url = url.replace('8001', port.toString());
  }
  return originalFetch(url, init);
};

// 2. 非同步載入 Port 並啟動 React
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
