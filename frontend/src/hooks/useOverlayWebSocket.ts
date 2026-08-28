import { useEffect } from 'react';
import { backendWebSocketUrl } from "../services/backend";

export interface HudConfigMessage {
  type: 'config';
  data: unknown;
}

export function relayHudConfig(
  channel: Pick<BroadcastChannel, 'postMessage'>,
  data: unknown,
): void {
  channel.postMessage({ type: 'config', data } satisfies HudConfigMessage);
}

// For the frontend UI, it doesn't currently consume the hud:audio and hud:media
// events (they go directly to the external HUD window via hud_overlay/shared/ws.js).
// But for completeness, we establish the hook pattern in case future overlay
// controls in the UI need real-time data from /ws/overlay.
export function useOverlayWebSocket(url?: string) {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    const hudChannel = new BroadcastChannel('horizon_tuner_hud_channel');

    const connect = () => {
      ws = new WebSocket(url ?? backendWebSocketUrl("/ws/overlay"));

      ws.onopen = () => {
        console.log("Overlay WebSocket connected.");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hud:config') {
            relayHudConfig(hudChannel, msg.data);
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
      hudChannel.close();
    };
  }, [url]);
}
