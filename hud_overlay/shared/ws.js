// =============================================================================
// shared/ws.js
// Listening to Backend WebSocket directly
// Data Flow: Backend -> HUD Window
// =============================================================================

let ws = null;
let isConnected = false;

export function initWebSocket() {
    console.log('[HUD Receiver] Initializing Backend WebSocket connection');
    
    // Connect to the backend WebSocket using the same host as the page (or default to 8001 if testing locally)
    const host = window.location.port ? window.location.host : '127.0.0.1:8001';
    ws = new WebSocket(`ws://${host}/ws`);

    ws.onopen = () => {
        console.log('[HUD Receiver] WebSocket connected');
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

    ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
            // Binary telemetry data (128 bytes)
            const arrayBuffer = await event.data.arrayBuffer();
            const dataView = new DataView(arrayBuffer);
            window.dispatchEvent(new CustomEvent('telemetry_binary', { detail: dataView }));
        } else {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type) {
                    if (msg.type === 'hud:config') {
                        // Update from backend when config is saved in main UI
                        window.dispatchEvent(new CustomEvent('hud:config', { detail: msg.data }));
                    } else if (msg.type === 'hud:animate') {
                        // Sent from backend when HUD is toggled
                        window.dispatchEvent(new CustomEvent('hud:animate'));
                    }
                } else {
                    // Raw telemetry dict
                    window.dispatchEvent(new CustomEvent('telemetry', { detail: msg }));
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
    };

    ws.onclose = () => {
        console.log('[HUD Receiver] WebSocket disconnected');
        isConnected = false;
        window.dispatchEvent(new CustomEvent('ws:disconnected'));
        setTimeout(initWebSocket, 2000); // Auto-reconnect
    };
}

window.wsIsConnected = () => isConnected;

