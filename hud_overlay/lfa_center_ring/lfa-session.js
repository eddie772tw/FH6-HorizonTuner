/* Reported lap/rank UI only: no extrapolated clock, inferred lap times, or network changes. */
(function (root) {
    'use strict';
    const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const nonnegative = v => finite(v) !== null && v >= 0 ? v : null;
    const positive = v => finite(v) !== null && v > 0 ? v : null;
    const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max ? v : null;
    const own = (d, key) => Object.prototype.hasOwnProperty.call(d, key);
    const choose = (d, canonical, raw) => own(d, canonical) ? d[canonical] : d[raw];
    const NOTICE_MS = 3000, GAP_MS = 1500;
    function normalize(d, timestamp) {
        const rank = integer(choose(d, 'race_position', 'RacePosition'), 255);
        return {
            timestamp, rank: rank > 0 ? rank : null,
            currentLap: nonnegative(d.CurrentLap), lastLap: positive(d.LastLap), bestLap: positive(d.BestLap),
            lap: integer(choose(d, 'lap', 'LapNumber'), 65535), raceTime: nonnegative(d.CurrentRaceTime),
            car: integer(choose(d, 'carOrdinal', 'CarOrdinal'), Number.MAX_SAFE_INTEGER),
        };
    }
    function formatLap(seconds) {
        if (nonnegative(seconds) === null) return '—:—';
        const hundredths = Math.round(seconds * 100);
        if (hundredths > 599999) return '—:—';
        const minutes = Math.floor(hundredths / 6000);
        const secs = Math.floor(hundredths / 100) % 60;
        return minutes + ':' + String(secs).padStart(2, '0') + '.' + String(hundredths % 100).padStart(2, '0');
    }
    function create() { return { previous: null, seenAt: null, notice: null, notifiedLap: null, warming: false }; }
    function clear(state) { state.previous = null; state.seenAt = null; state.notice = null; state.notifiedLap = null; state.warming = false; }
    function baseline(state, frame, now) { clear(state); state.previous = frame; state.seenAt = now; }
    function update(state, frame, now, eligible) {
        const hasRaceData = [frame.currentLap, frame.lastLap, frame.bestLap, frame.lap].some(v => v !== null);
        if (!eligible || frame.timestamp === null || !hasRaceData) { clear(state); return; }
        const p = state.previous;
        if (!p) { baseline(state, frame, now); return; }
        if (frame.timestamp === p.timestamp) return;
        if (now - state.seenAt >= GAP_MS) { baseline(state, frame, now); return; }
        if (frame.timestamp < p.timestamp) {
            if (p.timestamp > 0xffff0000 && frame.timestamp < 0x10000) baseline(state, frame, now);
            else if (frame.lap === 0 && p.lap > 0 && frame.raceTime !== null && frame.raceTime <= 1 && p.raceTime > frame.raceTime + 1) {
                // A new epoch corroborated by both race-clock and completed-lap reset.
                // The next increasing packet also baselines, preventing delayed old-session celebrations.
                baseline(state, frame, now); state.warming = true;
            }
            return; // Late packets never roll the event baseline backward.
        }
        if (state.warming) { baseline(state, frame, now); return; }
        const reset = (frame.car !== null && p.car !== null && frame.car !== p.car)
            || (frame.raceTime !== null && p.raceTime !== null && frame.raceTime < p.raceTime)
            || (frame.lap !== null && p.lap !== null && frame.lap < p.lap)
            || (frame.bestLap === null && p.bestLap !== null);
        if (reset) { baseline(state, frame, now); return; }
        const counterStep = p.lap !== null && frame.lap === p.lap + 1;
        const counterJump = p.lap !== null && frame.lap !== null && frame.lap > p.lap + 1;
        if (counterJump) { baseline(state, frame, now); return; }
        const lastChanged = frame.lastLap !== null && p.lastLap !== null && frame.lastLap !== p.lastLap;
        const completed = counterStep || (lastChanged && (frame.lap === null || frame.lap !== state.notifiedLap));
        const improved = frame.bestLap !== null && ((p.bestLap !== null && frame.bestLap < p.bestLap - .001)
            || (p.bestLap === null && counterStep));
        if (improved) state.notice = { text: 'BEST LAP', until: now + NOTICE_MS };
        else if (completed && !(state.notice?.text === 'BEST LAP' && now < state.notice.until)) {
            state.notice = { text: frame.lap === null ? 'LAP DONE' : 'LAP ' + frame.lap, until: now + NOTICE_MS };
        }
        if (completed) state.notifiedLap = frame.lap;
        state.previous = frame; state.seenAt = now;
    }
    function centerText(state, frame, now, live, shift, status) {
        if (!live) return status;
        if (shift) return 'SHIFT';
        if (state.notice && now < state.notice.until) return state.notice.text;
        return frame.rank === null ? 'LIVE' : 'P' + frame.rank;
    }
    root.LfaSession = { NOTICE_MS, normalize, formatLap, create, update, centerText };
})(typeof window === 'undefined' ? globalThis : window);
