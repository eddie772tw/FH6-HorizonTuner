import { normalizeGaugeValueSources } from './gauge-sources.js';

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
    // Missing means an older config that used the main gauge scale. An explicit
    // (even invalid) independent value must never resume following the gauge.
    const scale = Object.hasOwn(config, 'audioHeadScale') ? config.audioHeadScale : config.scale;
    normalized.audioHeadScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0
        ? Math.max(0.5, Math.min(2, scale)) : 1;
    normalized.audioHeadEdge = ['left', 'right', 'top', 'bottom'].includes(config.audioHeadEdge)
        ? config.audioHeadEdge : 'left';
    normalized.audioHeadOffset = finite(config.audioHeadOffset, 0, 4000);
    normalized.audioHeadCenterOffset = finite(config.audioHeadCenterOffset, -4000, 4000);
    return normalized;
}

export function normalizeAuxiliaryConfig(config) {
    const normalized = { ...config };
    const legacy = config.hudStyle === 'auxiliary_gauges';
    const elements = config.elements && typeof config.elements === 'object' && !Array.isArray(config.elements)
        ? { ...config.elements } : {};
    const hasSettings = legacy || Object.keys(config).some(key => key.startsWith('auxGauge'))
        || Object.hasOwn(config, 'gaugeValueSources') || Object.hasOwn(elements, 'showAuxiliaryGauges');
    if (!hasSettings) return normalized;
    if (legacy) {
        normalized.hudStyle = 'vfd';
        if (!Object.hasOwn(elements, 'showAuxiliaryGauges')) elements.showAuxiliaryGauges = elements.showGauge !== false;
    }
    if (Object.hasOwn(elements, 'showAuxiliaryGauges')) {
        elements.showAuxiliaryGauges = elements.showAuxiliaryGauges === true;
        normalized.elements = elements;
    }
    const faces = ['aem', 'greddy', 'blitz', 'defi', 'speedhut'];
    const legacyFaces = faces.includes(config.auxGaugeMode) ? [config.auxGaugeMode] : ['aem', 'greddy', 'defi'];
    normalized.auxGaugeFaces = Array.isArray(config.auxGaugeFaces)
        ? [...new Set(config.auxGaugeFaces.filter(face => faces.includes(face)))] : legacyFaces;
    delete normalized.auxGaugeMode;
    const finite = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value)) : fallback;
    normalized.auxGaugeMaxPerRow = Math.trunc(finite(config.auxGaugeMaxPerRow, 1, 5, 3));
    normalized.auxGaugeOrientation = config.auxGaugeOrientation === 'vertical' ? 'vertical' : 'horizontal';
    normalized.auxGaugeEdge = ['left', 'right', 'top', 'bottom'].includes(config.auxGaugeEdge) ? config.auxGaugeEdge : 'right';
    normalized.auxGaugeOffset = finite(config.auxGaugeOffset, 0, 4000, 0);
    normalized.auxGaugeCenterOffset = finite(config.auxGaugeCenterOffset, -4000, 4000, 0);
    normalized.gaugeValueSources = normalizeGaugeValueSources(config.gaugeValueSources);
    return normalized;
}
