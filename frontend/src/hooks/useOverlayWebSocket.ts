import { useEffect } from 'react';

// For the frontend UI, it doesn't currently consume the hud:audio and hud:media
// events (they go directly to the external HUD window via hud_overlay/shared/ws.js).
// But for completeness, we establish the hook pattern in case future overlay
// controls in the UI need real-time data from /ws/overlay.
export function useOverlayWebSocket(url: string = "ws://127.0.0.1:8001/ws/overlay") {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      let finalUrl = url;
      if (url.includes("8001")) {
        const port = (window as any).BACKEND_PORT || 8001;
        finalUrl = url.replace("8001", port.toString());
      }

      ws = new WebSocket(finalUrl);

      ws.onopen = () => {
        console.log("Overlay WebSocket connected.");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hud:config') {
            window.dispatchEvent(new CustomEvent('hud:config:sync', { detail: msg.data }));
          }
        } catch (e) {
          console.error("Error parsing overlay websocket data:", e);
        }
      };

      ws.onclose = () => {
        console.log("Overlay WebSocket closed. Reconnecting...");
        ws = null;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = (e) => {
        console.error("Overlay WebSocket error:", e);
        if (ws) ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [url]);
}
