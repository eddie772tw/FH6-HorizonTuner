/**
 * 獲取後端 API 的 Base URL，動態依據 BACKEND_PORT 決定
 */
export function getApiBaseUrl(): string {
  // Tauri 環境下會注入 BACKEND_PORT
  const port = (window as any).BACKEND_PORT || 8001;
  return `http://127.0.0.1:${port}`;
}
