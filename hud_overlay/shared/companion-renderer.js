import { initCoordinator, setFrameSmoothing } from './coordinator.js';
import { setSpeedUnit } from './utils.js';

/** Local instrument-only configuration. Never inherit desktop auxiliary overlays. */
export function companionInstrumentConfig(style, scale = 1) {
    return {
        hudStyle: style, scale, useDefaultColors: true, glowIntensity: 1,
        s650Theme: 'heritage67',
        elements: { showGauge: true, showTeleMaster: false, showTeleGamepad: false, showMotionEffect: false },
    };
}

export function resolveCompanionInstrument(id, catalog) {
    return Object.hasOwn(catalog, id) ? id : 'vfd';
}

/** Android provides raw frames; the existing HUD coordinator owns all normalization. */
export function mountCompanionInstrument(iframe, catalog, requestedStyle) {
    const style = resolveCompanionInstrument(requestedStyle, catalog);
    let lastFrame = null;
    let ready = false;
    const post = (type, data = {}) => iframe.contentWindow?.postMessage({ type, ...data }, location.origin);
    const fit = () => {
        if (!ready) return;
        const child = iframe.contentWindow;
        const active = child?.HUDCore?.getActiveStyle();
        const container = active && child.document.getElementById(active.containerId);
        if (!container) return;
        // Measure the renderer's own baseline, then scale through its public config hook.
        child.HUDCore.handleMessage('config', { data: companionInstrumentConfig(style) });
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const scale = Math.min((iframe.clientWidth - 24) / rect.width, (iframe.clientHeight - 24) / rect.height);
            child.HUDCore.handleMessage('config', { data: companionInstrumentConfig(style, Math.max(0.05, scale)) });
        }
    };
    const onFrame = event => {
        lastFrame = event.detail;
        if (ready) post('hud:frame', lastFrame);
    };
    setSpeedUnit(true);
    initCoordinator();
    setFrameSmoothing(false);
    window.addEventListener('hud:frame', onFrame);
    window.addEventListener('resize', fit);
    iframe.onload = () => {
        ready = true;
        const sheet = iframe.contentDocument.createElement('style');
        sheet.textContent = '.hud-root-wrapper{align-items:center!important;justify-content:center!important;padding:0!important} .hud-gauge-container{transform-origin:center!important;transition:none!important} #teleCardsMount{display:none!important}';
        iframe.contentDocument.head.append(sheet);
        // Apply the disabled auxiliary contract before the first telemetry frame.
        iframe.contentWindow.HUDCore?.handleMessage('config', { data: companionInstrumentConfig(style) });
        const active = iframe.contentWindow.HUDCore?.getActiveStyle();
        const container = active && iframe.contentDocument.getElementById(active.containerId);
        if (container) {
            // Some instruments use their own wrapper or absolute desktop anchoring.
            const parent = container.parentElement;
            for (const [key, value] of Object.entries({ position: 'fixed', inset: '0', display: 'flex', 'align-items': 'center', 'justify-content': 'center', padding: '0', perspective: 'none' })) parent.style.setProperty(key, value, 'important');
            for (const [key, value] of Object.entries({ position: 'relative', inset: 'auto', transform: 'none', 'transform-origin': 'center' })) container.style.setProperty(key, value, 'important');
        }
        fit();
        iframe.dataset.ready = 'true';
        iframe.contentDocument.fonts?.ready.then(fit);
        if (lastFrame) post('hud:frame', lastFrame);
    };
    iframe.src = new URL(`../${style}/index.html`, import.meta.url).href;
    window.companionTelemetry = raw => window.dispatchEvent(new CustomEvent('telemetry', { detail: raw }));
    window.addEventListener('pagehide', () => {
        ready = false;
        post('hud:destroy');
        window.removeEventListener('hud:frame', onFrame);
        window.removeEventListener('resize', fit);
        delete window.companionTelemetry;
    }, { once: true });
}
