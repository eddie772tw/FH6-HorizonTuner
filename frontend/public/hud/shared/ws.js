// =============================================================================
// shared/ws.js
// Listening to BroadcastChannel and window messages from Frontend UI
// Data Flow: Backend -> Frontend UI -> HUD Window
// =============================================================================

const channel = new BroadcastChannel('horizon_tuner_hud_channel');

export function initWebSocket() {
    console.log('[HUD Receiver] Initialized BroadcastChannel listener from Frontend UI');
    
    channel.onmessage = (event) => {
        const { type, data } = event.data || {};
        if (type === 'telemetry') {
            window.dispatchEvent(new CustomEvent('telemetry', { detail: data }));
        } else if (type === 'config') {
            window.dispatchEvent(new CustomEvent('hud:config', { detail: data }));
        }
    };

    window.addEventListener('message', (event) => {
        const { type, data } = event.data || {};
        if (type === 'telemetry') {
            window.dispatchEvent(new CustomEvent('telemetry', { detail: data }));
        } else if (type === 'config') {
            window.dispatchEvent(new CustomEvent('hud:config', { detail: data }));
        }
    });

    window.dispatchEvent(new CustomEvent('ws:connected'));
}

window.wsIsConnected = () => true;
