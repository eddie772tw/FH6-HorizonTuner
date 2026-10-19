// Shared by the control panel and the standalone HUD launcher.
export function normalizeAudioHeadConfig(config) {
    const normalized = { ...config };
    const elements = config.elements && typeof config.elements === 'object' && !Array.isArray(config.elements)
        ? { ...config.elements } : {};
    const legacy = config.hudStyle === 'audio_head';
    const hasSettings = legacy || Object.keys(config).some(key => key.startsWith('audioHead'))
        || Object.hasOwn(elements, 'showAudioHead');
    if (!hasSettings) return normalized;

    if (legacy) {
        normalized.hudStyle = 'vfd';
        if (!Object.hasOwn(elements, 'showAudioHead')) {
            elements.showAudioHead = elements.showGauge !== false;
        }
    }
    if (Object.hasOwn(elements, 'showAudioHead')) {
        elements.showAudioHead = elements.showAudioHead === true;
        normalized.elements = elements;
    }
    const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value)) : 0;
    normalized.audioHeadDeck = Math.trunc(finite(config.audioHeadDeck, 0, 8));
    normalized.audioHeadEdge = ['left', 'right', 'top', 'bottom'].includes(config.audioHeadEdge)
        ? config.audioHeadEdge : 'left';
    normalized.audioHeadOffset = finite(config.audioHeadOffset, 0, 4000);
    normalized.audioHeadCenterOffset = finite(config.audioHeadCenterOffset, -4000, 4000);
    return normalized;
}
