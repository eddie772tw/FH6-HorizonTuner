/* Original center-ring display contract. Canonical HUD units, no vehicle physics. */
(function (root) {
    'use strict';
    const STALE_MS = 1500;
    const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const positive = (value) => finite(value) !== null && value > 0 ? value : null;
    const nonnegative = (value) => finite(value) !== null && value >= 0 ? value : null;
    const ratio = (value) => finite(value) === null ? null : Math.max(0, Math.min(1, value));
    const speedReading = (value) => finite(value) !== null && Math.abs(value) <= 999 ? Math.abs(value) : null;
    const object = (value) => value && typeof value === 'object' ? value : {};

    function gear(value) {
        if (!Number.isInteger(value)) return '—';
        if (value === 0) return 'R';
        if (value === 11) return 'N';
        return value >= 1 && value <= 10 ? String(value) : '—';
    }

    function config(input, previous) {
        const p = object(input);
        const old = previous || { isMetric: true, accent: '#edf7fa', glow: 1, showGauge: true };
        let metric = old.isMetric;
        if (typeof p.isMetric === 'boolean') metric = p.isMetric;
        if (p.unit === 'mph' || p.unit === 'kmh') metric = p.unit !== 'mph';
        if (p.effectiveUnits?.speed === 'mph' || p.effectiveUnits?.speed === 'kmh') metric = p.effectiveUnits.speed !== 'mph';
        let accent = old.accent;
        if (p.useDefaultColors === true) accent = '#edf7fa';
        if (p.useDefaultColors === false && /^#[0-9a-f]{6}$/i.test(p.customColor || '')) accent = p.customColor;
        const glow = finite(p.glowIntensity);
        return {
            isMetric: metric,
            temperatureUnit: ['C', 'F'].includes(p.effectiveUnits?.temperature) ? p.effectiveUnits.temperature : ['C', 'F'].includes(p.units?.temperature) ? p.units.temperature : old.temperatureUnit || null,
            boostUnit: root.LfaAuxiliary.unit(p.effectiveUnits?.boostPressure) || root.LfaAuxiliary.unit(p.units?.boostPressure) || old.boostUnit || null,
            accent,
            glow: glow === null ? old.glow : Math.max(0, Math.min(2, glow)),
            showGauge: typeof p.elements?.showGauge === 'boolean' ? p.elements.showGauge : old.showGauge,
            lfaManualExpand: Object.prototype.hasOwnProperty.call(p, 'lfaManualExpand') ? p.lfaManualExpand === true : old.lfaManualExpand === true,
            lfaAutoExpand: Object.prototype.hasOwnProperty.call(p, 'lfaAutoExpand') ? p.lfaAutoExpand === true : old.lfaAutoExpand === true,
        };
    }

    function frame(input, payload, settings) {
        const d = object(input), p = object(payload);
        // Coordinator owns conversions. Explicit speed channels also allow immediate unit changes.
        const units = d.displayUnits?.speed;
        const metric = units === 'kmh' ? true : units === 'mph' ? false : settings.isMetric;
        let speed = speedReading(metric ? d.speed_kmh : d.speed_mph);
        if (speed === null && (units === 'mph' || units === 'kmh')) speed = speedReading(d.speed);
        const maxRpm = positive(d.maxRpm) ?? positive(d.max_rpm);
        const redline = positive(p.redlineRpm) ?? positive(d.redlineRpm);
        const raceOn = d.isRaceOn ?? d.is_race_on ?? d.IsRaceOn;
        const timestamp = nonnegative(d.timestamp_ms) ?? nonnegative(d.TimestampMS);
        return {
            rpm: nonnegative(d.rpm), maxRpm,
            redline: maxRpm && redline ? Math.min(maxRpm, redline) : null,
            speed, speedUnit: metric ? 'km/h' : 'mph', gear: gear(d.gear),
            throttle: ratio(d.throttle), brake: ratio(d.brake),
            auxiliary: root.LfaAuxiliary.normalize(d), race: root.LfaSession.normalize(d, timestamp),
            timestamp,
            raceOn: raceOn !== 0 && raceOn !== false,
            failed: d.success === false || p.success === false || Boolean(d.error || p.error),
        };
    }

    function scale(maxRpm) {
        // Preserve the 0–10 face for normal engines; use truthful numeric ticks for higher rev limits.
        const maximum = Math.max(10000, Math.ceil((positive(maxRpm) || 10000) / 2000) * 2000);
        return { maximum, ticks: Array.from({ length: 11 }, (_, i) => i * maximum / 10) };
    }
    function angle(rpm, maximum) {
        return Math.PI / 2 + Math.max(0, Math.min(1, (nonnegative(rpm) || 0) / maximum)) * Math.PI * 5 / 3;
    }
    function newState() {
        return { latest: null, token: null, lastAdvance: null, blocked: false, settings: config({}), race: root.LfaSession.create(), expansion: root.LfaExpansion.createRace() };
    }
    function ingest(state, data, payload, now) {
        const latest = frame(data, payload, state.settings);
        state.latest = latest;
        state.blocked = latest.failed || !latest.raceOn;
        const hasReading = latest.rpm !== null || latest.speed !== null;
        root.LfaSession.update(state.race, latest.race, now, hasReading && !state.blocked);
        // Layout follows the lap signal, independently of speed/RPM availability or pause readout safety.
        root.LfaExpansion.ingestRace(state.expansion, latest.race, now, !latest.failed);
        // Timestamp changes, not onFrame delivery, prove fresh UDP data: coordinator replays frames.
        // Untimestamped third-party fixtures are supported only when meaningful values change.
        const token = latest.timestamp !== null ? 't:' + latest.timestamp
            : hasReading && (latest.rpm > 0 || latest.speed > 0)
                ? ['v', latest.rpm, latest.speed, latest.gear, latest.throttle, latest.brake].join(':') : null;
        if (token !== null && token !== state.token && hasReading && !state.blocked) {
            state.lastAdvance = now;
            state.token = token;
        }
        return state;
    }
    function view(state, now) {
        const f = state.latest;
        let status = 'WAITING';
        if (f?.failed) status = 'DATA ERROR';
        else if (f && !f.raceOn) status = 'PAUSED';
        else if (f && f.rpm === null && f.speed === null) status = 'NO DATA';
        else if (state.lastAdvance !== null) status = now - state.lastAdvance >= STALE_MS ? 'NO SIGNAL' : 'LIVE';
        const live = status === 'LIVE';
        const source = live ? f : frame({}, {}, state.settings);
        const dial = scale(source.maxRpm);
        const shift = live && source.rpm !== null && source.redline !== null && source.rpm >= source.redline;
        return { ...source, status, live, shift, dial,
            expansionTarget: root.LfaExpansion.target(state.expansion, state.settings, now),
            needle: live && source.rpm !== null ? angle(source.rpm, dial.maximum) : null,
            speedText: source.speed === null ? '—' : String(Math.round(source.speed)),
            rpmText: source.rpm === null ? '—' : Math.round(source.rpm).toLocaleString('en-US'),
            auxiliary: root.LfaAuxiliary.display(source.auxiliary, state.settings),
            lapText: root.LfaSession.formatLap(source.race.currentLap),
            centerText: root.LfaSession.centerText(state.race, source.race, now, live, shift, status),
        };
    }
    root.LfaModel = { STALE_MS, finite, gear, config, frame, scale, angle, newState, ingest, view };
})(typeof window === 'undefined' ? globalThis : window);
