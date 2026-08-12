// =============================================================================
// shared/ws.js
// Listening to Backend WebSocket directly
// Data Flow: Backend -> HUD Window
// =============================================================================

import { createOverlayEventDedupe } from './overlay-dedupe.js';

let telemetryWs = null;
let overlayWs = null;
let isConnected = false;
let isOverlayConnected = false;
const overlayEventDedupe = createOverlayEventDedupe((type, data) => {
    window.dispatchEvent(new CustomEvent(type, { detail: data }));
});

export function initWebSocket() {
    console.log('[HUD Receiver] Initializing Backend WebSocket connection');
    
    // Connect to the backend WebSocket using the same host as the page (or default to 8001 if testing locally)
    const host = window.location.port ? window.location.host : '127.0.0.1:8001';

    initTelemetryWebSocket(host);
    initOverlayWebSocket(host);
}

function initTelemetryWebSocket(host) {
    telemetryWs = new WebSocket(`ws://${host}/ws/telemetry`);

    telemetryWs.onopen = () => {
        console.log('[HUD Receiver] Telemetry WebSocket connected');
        isConnected = true;
        window.dispatchEvent(new CustomEvent('ws:connected'));
        
        // Request initial config on connection
        fetch(`http://${host}/api/overlay/config`)
            .then(res => res.json())
            .then(data => {
                window.dispatchEvent(new CustomEvent('hud:config', { detail: data }));
            })
            .catch(err => console.error('[HUD Receiver] Failed to fetch initial config', err));
    };

    telemetryWs.onmessage = async (event) => {
        if (event.data instanceof Blob) {
            // Binary telemetry data (128 bytes)
            const arrayBuffer = await event.data.arrayBuffer();
            const dataView = new DataView(arrayBuffer);
            window.dispatchEvent(new CustomEvent('telemetry_binary', { detail: dataView }));
        } else {
            try {
                const msg = JSON.parse(event.data);
                // Raw telemetry dict
                window.dispatchEvent(new CustomEvent('telemetry', { detail: msg }));
            } catch (e) {
                // Ignore parsing errors
            }
        }
    };

    telemetryWs.onclose = () => {
        console.log('[HUD Receiver] Telemetry WebSocket disconnected');
        isConnected = false;
        window.dispatchEvent(new CustomEvent('ws:disconnected'));
        setTimeout(() => initTelemetryWebSocket(host), 2000); // Auto-reconnect
    };
}

function initOverlayWebSocket(host) {
    overlayWs = new WebSocket(`ws://${host}/ws/overlay`);

    overlayWs.onopen = () => {
        console.log('[HUD Receiver] Overlay WebSocket connected');
        isOverlayConnected = true;
        overlayEventDedupe.reset();
    };

    overlayWs.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type) {
                if (msg.type === 'hud:config') {
                    window.dispatchEvent(new CustomEvent('hud:config', { detail: msg.data }));
                } else if (msg.type === 'hud:animate') {
                    window.dispatchEvent(new CustomEvent('hud:animate'));
                } else if (msg.type === 'hud:audio') {
                    overlayEventDedupe.onAudio(msg.data);
                } else if (msg.type === 'hud:media') {
                    overlayEventDedupe.onMedia(msg.data);
                }
            }
        } catch (e) {
            // Ignore parsing errors
        }
    };

    overlayWs.onclose = () => {
        console.log('[HUD Receiver] Overlay WebSocket disconnected');
        isOverlayConnected = false;
        overlayEventDedupe.onDisconnect();
        setTimeout(() => initOverlayWebSocket(host), 2000); // Auto-reconnect
    };
}

window.wsIsConnected = () => isConnected;

