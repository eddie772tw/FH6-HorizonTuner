/* UDP-owned identity and monotonic non-race status carousel. No network or fabricated names. */
(function (root) {
    'use strict';
    const STALE_MS = 1500, SLOT_MS = 3000, UINT32 = 0x100000000;
    const classes = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];
    const own = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
    const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max ? v : null;
    const raw = d => ['TimestampMS', 'CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'IsRaceOn', 'CarOrdinal'].some(k => own(d, k));
    function field(d, original, aliases) {
        if (own(d, original)) return d[original];
        if (raw(d)) return undefined;
        for (const k of aliases) if (own(d, k)) return d[k];
    }
    function normalize(d) {
        return { timestamp: integer(field(d, 'TimestampMS', ['timestamp_ms']), 0, UINT32 - 1),
            ordinal: integer(field(d, 'CarOrdinal', ['carOrdinal', 'car_ordinal']), 1, 0x7fffffff),
            carClass: integer(field(d, 'CarClass', ['carClass', 'car_class']), 0, 7),
            pi: integer(field(d, 'CarPerformanceIndex', ['carPi', 'car_pi']), 100, 999),
            lap: integer(d.LapNumber ?? d.lap, 0, 65535),
            raceTime: typeof d.CurrentRaceTime === 'number' && Number.isFinite(d.CurrentRaceTime) && d.CurrentRaceTime >= 0 ? d.CurrentRaceTime : null };
    }
    function create() { return { timestamp: null, lastFresh: null, identity: null, previous: null, candidate: null, epoch: null, restartVersion: 0, notice: null, elapsed: 0, lastNow: null, running: false }; }
    function time(state, now) { if (typeof now !== 'number' || !Number.isFinite(now)) return state.lastNow ?? 0; return Math.max(state.lastNow ?? 0, now); }
    function order(a, b) {
        if (a === b) return 0;
        if (a > 0xffff0000 && b < 0x10000) return 1;
        if (b > 0xffff0000 && a < 0x10000) return -1;
        return b > a ? 1 : -1;
    }
    function distance(a, b) { return b >= a ? b - a : UINT32 - a + b; }
    function resetCarousel(state) { state.elapsed = 0; state.running = false; state.notice = null; }
    function fresh(state, now) { return state.lastFresh !== null && now - state.lastFresh < STALE_MS; }
    function ingest(state, data, nowMs) {
        const f = normalize(data), now = time(state, nowMs);
        if (f.timestamp === null) return false;
        const wasFresh = fresh(state, now), previous = state.previous;
        const newCar = previous && f.ordinal !== previous.ordinal;
        let reset = false;
        // A synthetic zero-filled standby cannot clear Pending. A real initial zero
        // becomes connected only after the next genuinely advancing timestamp.
        if (state.timestamp === null && f.timestamp === 0) { state.timestamp = 0; state.previous = f; return false; }
        if (state.timestamp !== null) {
            const direction = order(state.timestamp, f.timestamp);
            if (direction === 0) return false;
            if (direction < 0) {
                const c = state.candidate;
                if (c && now - c.now < STALE_MS && f.ordinal === c.frame.ordinal && order(c.frame.timestamp, f.timestamp) > 0
                    && distance(c.frame.timestamp, f.timestamp) <= now - c.now + 1000) {
                    reset = true; state.restartVersion++; state.epoch = { timestamp: f.timestamp, now };
                } else {
                    const clockRestart = f.lap === 0 && f.raceTime !== null && f.raceTime <= 1 && previous?.raceTime > f.raceTime + 1;
                    // The route exposes no source epoch. After silence, a same-car
                    // free-roam low-counter sequence is a bounded restart inference.
                    // A deliberately replayed matching sequence is indistinguishable.
                    const freeRoamRestart = !wasFresh && state.timestamp >= 2000 && f.timestamp <= 1000
                        && f.ordinal !== null && f.ordinal === previous?.ordinal
                        && f.lap === 0 && previous?.lap === 0 && f.raceTime === 0 && previous?.raceTime === 0;
                    if ((newCar && f.timestamp <= 1000) || clockRestart || freeRoamRestart) {
                        state.candidate = { frame: f, now }; state.lastFresh = null; state.identity = null; resetCarousel(state);
                    }
                    return false;
                }
            } else if (state.epoch && distance(state.epoch.timestamp, f.timestamp) > now - state.epoch.now + 1000) return false;
        }
        if (!wasFresh || newCar || reset) resetCarousel(state);
        else if (previous && ((f.raceTime !== null && previous.raceTime !== null && f.raceTime < previous.raceTime) || (f.lap !== null && previous.lap !== null && (f.lap < previous.lap || f.lap > previous.lap + 1)))) state.notice = null;
        state.candidate = null; state.timestamp = f.timestamp; state.lastFresh = now; state.identity = f; state.previous = f;
        return true;
    }
    function name(catalog, ordinal) {
        const item = ordinal !== null && catalog && Object.prototype.hasOwnProperty.call(catalog, String(ordinal)) ? catalog[String(ordinal)] : null;
        if (!item || typeof item !== 'object') return 'CAR N/A';
        const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
        return Array.from(clean(item.display_name) || ['year', 'make', 'model'].map(k => k === 'year' && Number.isInteger(item[k]) ? String(item[k]) : clean(item[k])).filter(Boolean).join(' ')).slice(0, 240).join('') || 'CAR N/A';
    }
    function view(state, context, nowMs, catalog) {
        const now = time(state, nowMs), connected = fresh(state, now);
        if (!connected) { state.identity = null; resetCarousel(state); }
        if (context.status === 'DATA ERROR' || context.status === 'PAUSED') state.notice = null;
        if (connected && context.notice && now < context.notice.until) state.notice = { ...context.notice };
        const notice = state.notice && now < state.notice.until ? state.notice.text : null;
        const running = connected && context.live && !context.shift && !notice && !context.racing;
        if (running && state.running && state.lastNow !== null) state.elapsed += now - state.lastNow;
        state.lastNow = now; state.running = running;
        let text, kind = 'status';
        if (!connected) text = 'Pending......';
        else if (!context.live) text = context.status;
        else if (context.shift) text = 'SHIFT';
        else if (notice) text = notice;
        else if (context.racing) text = context.rank === null ? 'LIVE' : 'P' + context.rank;
        else {
            const slot = Math.floor(state.elapsed / SLOT_MS) % 4, f = state.identity;
            kind = ['pi', 'car', 'brand', 'connection'][slot];
            text = [f?.carClass === null || f?.pi === null ? 'PI N/A' : classes[f.carClass] + ' ' + f.pi,
                name(catalog, f?.ordinal ?? null), 'crosXover', 'LIVE'][slot];
        }
        return { text, kind, connected };
    }
    root.LfaStatus = { STALE_MS, SLOT_MS, classes, normalize, create, ingest, view, name };
})(typeof window === 'undefined' ? globalThis : window);
