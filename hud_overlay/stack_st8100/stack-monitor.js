/* Fresh advancing telemetry owns warnings and tell-tales, not animation callbacks. */
(function (root) {
    'use strict';
    const M = root.StackModel, HOLD_MS = 500, SAMPLE_GAP_MS = 500;
    function alarm() { return { active: false, since: null }; }
    function clearAlarm(a) { a.active = false; a.since = null; }
    function clearWarnings(s) { for (let i = 0; i < 3; i++) clearAlarm(s.alarms[i]); s.warning = null; s.shift = false; root.StackSchedule.reset(s.display); }
    function resetSession(s) { s.peakRpm = null; s.peakSpeed = null; s.peakTireC = null; s.peakBoostBar = null; clearWarnings(s); }
    function create() {
        return { settings: M.config({}), visualRpm: null, latest: {}, candidate: {}, timestamp: null, seenAt: null, status: 'WAITING',
            alarms: [alarm(), alarm(), alarm()], display: root.StackSchedule.create(), warning: null, shift: false,
            peakRpm: null, peakSpeed: null, peakTireC: null, peakBoostBar: null, blocked: false, epochCandidate: null, epochAt: null, epochCar: null, epochRaceTime: null };
    }
    function check(a, enabled, value, threshold, hysteresis, low, now) {
        if (!enabled || value === null) { clearAlarm(a); return; }
        const crossed = low ? value <= threshold : value >= threshold;
        const recovered = low ? value >= threshold + hysteresis : value <= threshold - hysteresis;
        if (a.active) { if (recovered) clearAlarm(a); return; }
        if (!crossed) { a.since = null; return; }
        if (a.since === null) a.since = now;
        if (now - a.since >= HOLD_MS) a.active = true;
    }
    function configure(s, input) { s.settings = M.config(input, s.settings); clearWarnings(s); }
    function tick(s, now) {
        if (s.status === 'LIVE' && s.seenAt !== null && now - s.seenAt >= M.STALE_MS) {
            s.status = 'NO SIGNAL'; clearWarnings(s);
        }
        if (s.status === 'LIVE') root.StackSchedule.advance(s.display, s.alarms, now);
        return s;
    }
    function ingest(s, data, payload, now) {
        const f = M.sample(data || {}, s.candidate), p = s.latest;
        if (f.failed || data?.success === false || data?.error || payload?.success === false || payload?.error) { s.status = 'DATA ERROR'; s.blocked = true; clearWarnings(s); return s; }
        if (f.raceOn === 0 || f.raceOn === false) { s.status = 'PAUSED'; s.blocked = true; clearWarnings(s); return s; }
        if (f.timestamp === null || (f.raceOn !== 1 && f.raceOn !== true)) { s.status = 'NO DATA'; s.blocked = true; clearWarnings(s); return s; }
        const carChanged = f.car !== null && p.car !== null && p.car !== undefined && f.car !== p.car;
        let raceReset = f.raceTime !== null && p.raceTime !== null && p.raceTime !== undefined
            && f.raceTime <= 1 && p.raceTime > 2 && f.lap === 0 && (p.lap > 0 || s.blocked || now - s.seenAt >= M.STALE_MS);
        const delta = s.timestamp === null ? 1 : (f.timestamp - s.timestamp + 0x100000000) % 0x100000000;
        if (delta >= 0x80000000) {
            const mayReset = carChanged || raceReset || (s.seenAt !== null && now - s.seenAt >= M.STALE_MS);
            const step = s.epochCandidate === null ? 0 : (f.timestamp - s.epochCandidate + 0x100000000) % 0x100000000;
            const coherentCar = f.car === s.epochCar;
            const coherentClock = f.raceTime === null || s.epochRaceTime === null || f.raceTime >= s.epochRaceTime;
            // Even a lap/clock reset-looking old packet needs a second progressing sample.
            // Do not overwrite the current epoch while gathering this evidence.
            if (mayReset && step > 0 && step < 0x80000000 && now - s.epochAt < SAMPLE_GAP_MS && coherentCar && coherentClock) raceReset = true;
            else {
                if (mayReset && s.epochCandidate !== f.timestamp) {
                    s.epochCandidate = f.timestamp; s.epochAt = now; s.epochCar = f.car; s.epochRaceTime = f.raceTime;
                }
                return tick(s, now);
            }
        } else if (delta === 0) {
            if (s.status === 'LIVE' && !s.blocked) s.visualRpm = M.visualRpm(data);
            return tick(s, now);
        }
        s.epochCandidate = null; s.epochAt = null; s.epochCar = null; s.epochRaceTime = null;
        if (carChanged || raceReset) resetSession(s);
        const gap = s.seenAt === null ? 0 : now - s.seenAt;
        if (s.blocked || gap >= SAMPLE_GAP_MS) clearWarnings(s);
        s.blocked = false; s.timestamp = f.timestamp; s.seenAt = now;
        s.latest = f; s.candidate = p; s.status = 'LIVE'; s.visualRpm = M.visualRpm(data);
        if (f.rpm !== null) s.peakRpm = Math.max(s.peakRpm ?? f.rpm, f.rpm);
        if (f.speedKmh !== null) s.peakSpeed = Math.max(s.peakSpeed ?? f.speedKmh, f.speedKmh);
        if (f.tireMaxC !== null) s.peakTireC = Math.max(s.peakTireC ?? f.tireMaxC, f.tireMaxC);
        if (f.boostBar !== null) s.peakBoostBar = Math.max(s.peakBoostBar ?? f.boostBar, f.boostBar);
        const c = s.settings;
        let hasAlarm = false;
        for (let i = 0; i < 3; i++) {
            const slot = c.stackSt8100Alarms[i], spec = M.METRICS[slot.metric];
            check(s.alarms[i], slot.enabled, f[spec.property], slot.threshold, spec.hysteresis, slot.direction === 'low', now);
            hasAlarm = hasAlarm || s.alarms[i].active;
        }
        s.warning = hasAlarm ? 'alarm' : null;
        root.StackSchedule.ingest(s.display, f, now);
        root.StackSchedule.advance(s.display, s.alarms, now);
        // EngineMaxRpm, never coordinator's estimated max-minus-1000 redline.
        const shiftAt = f.maxRpm === null ? null : f.maxRpm * c.stackSt8100ShiftPercent / 100;
        s.shift = c.stackSt8100ShiftEnabled && f.rpm !== null && shiftAt !== null && f.rpm >= shiftAt;
        return s;
    }
    root.StackMonitor = { HOLD_MS, SAMPLE_GAP_MS, create, configure, ingest, tick, resetSession, clearWarnings };
})(typeof window === 'undefined' ? globalThis : window);
