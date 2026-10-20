// TODO(subsystems): evaluate data quality and independent-element UX before exposing these modules.
// Assets and renderers remain packaged for that evaluation, including with WIP enabled.
export const DEFERRED_HUD_STYLES = new Set([
    'minimap_overlay', 'touge_pacenotes', 'telemetry_cards', 'speed_effects',
]);

export function normalizeSubsystemStyle(style) {
    return DEFERRED_HUD_STYLES.has(style) || style === 'gamepad_overlay' ? 'vfd' : style;
}

export function normalizeSubsystemConfig(config) {
    const normalized = { ...config };
    const legacy = config.hudStyle === 'gamepad_overlay';
    if (legacy) {
        const elements = config.elements && typeof config.elements === 'object' && !Array.isArray(config.elements)
            ? { ...config.elements } : {};
        if (!Object.hasOwn(elements, 'showTeleGamepad')) elements.showTeleGamepad = elements.showGauge !== false;
        normalized.elements = elements;
    }
    if (Object.hasOwn(config, 'hudStyle')) normalized.hudStyle = normalizeSubsystemStyle(config.hudStyle);
    if (legacy || Object.hasOwn(config, 'gamepadOffsetX') || Object.hasOwn(config, 'gamepadOffsetY') || Object.hasOwn(config, 'gamepadLayout') || Object.hasOwn(config.elements || {}, 'showTeleGamepad')) {
        normalized.gamepadLayout = config.gamepadLayout === 'dualsense' ? 'dualsense' : 'xbox';
        for (const key of ['gamepadOffsetX', 'gamepadOffsetY']) {
            const value = config[key];
            normalized[key] = typeof value === 'number' && Number.isFinite(value)
                ? Math.max(-50, Math.min(50, value)) : 0;
        }
        if (normalized.elements && Object.hasOwn(normalized.elements, 'showTeleGamepad')) {
            normalized.elements = { ...normalized.elements, showTeleGamepad: normalized.elements.showTeleGamepad === true };
        }
    }
    return normalized;
}
