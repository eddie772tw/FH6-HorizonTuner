/* Layout intent and motion only; reported lap time is never extrapolated. */
(function (root) {
    'use strict';
    const ENTRY_MS = 400, TIMING_GRACE_MS = 2000, STALE_MS = 3000;
    const UINT32 = 0x100000000, WRAP_WINDOW = 0x10000;
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const nonnegative = value => finite(value) && value >= 0 ? value : null;
    const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

    function createRace() {
        return {
            active: false, lastNowMs: null, lastAdvanceMs: null, invalidSinceMs: null,
            timestamp: null, currentLap: null, lap: null, raceTime: null, car: null,
            candidateSinceMs: null, candidateLap: null,
            resetTimestamp: null, resetRaceTime: null, resetCurrentLap: null, resetCar: null, resetSinceMs: null,
            epochTimestamp: null, epochSinceMs: null,
        };
    }
    function monotonic(state, nowMs) {
        if (!finite(nowMs) || nowMs < 0) return state.lastNowMs;
        state.lastNowMs = state.lastNowMs === null ? nowMs : Math.max(state.lastNowMs, nowMs);
        return state.lastNowMs;
    }
    function clearEvidence(state) {
        state.active = false;
        state.invalidSinceMs = null;
        state.candidateSinceMs = null;
        state.candidateLap = null;
    }
    function expire(state, now) {
        if (now !== null && ((state.lastAdvanceMs !== null && now - state.lastAdvanceMs >= STALE_MS)
            || (state.invalidSinceMs !== null && now - state.invalidSinceMs >= TIMING_GRACE_MS))) clearEvidence(state);
    }
    function confirmed(state, nowMs) {
        expire(state, monotonic(state, nowMs));
        return state.active;
    }
    function target(state, settings, nowMs) {
        const racing = confirmed(state, nowMs);
        return settings?.lfaManualExpand === true || (settings?.lfaAutoExpand === true && racing);
    }
    function layoutPolicy(settings, racing, mediaAvailable) {
        const race = racing === true, media = mediaAvailable === true;
        return { expanded: settings?.lfaManualExpand === true || (settings?.lfaAutoExpand === true && (race || media)),
            page: race ? 'race' : media ? 'media' : 'telemetry' };
    }
    function order(previous, next) {
        if (previous === next) return 0;
        // A genuine uint32 rollover remains fresh; delayed pre-wrap packets do not.
        if (previous >= UINT32 - WRAP_WINDOW && previous < UINT32 && next < WRAP_WINDOW) return 1;
        if (next >= UINT32 - WRAP_WINDOW && next < UINT32 && previous < WRAP_WINDOW) return -1;
        return next > previous ? 1 : -1;
    }
    function distance(previous, next) { return next >= previous ? next - previous : UINT32 - previous + next; }
    function remember(state, timestamp, currentLap, lap, raceTime, car, now) {
        state.timestamp = timestamp;
        state.currentLap = currentLap;
        state.lap = lap;
        state.raceTime = raceTime;
        state.car = car;
        state.lastAdvanceMs = now;
    }
    function ingestRace(state, frame, nowMs, eligible) {
        const now = monotonic(state, nowMs);
        expire(state, now);
        if (eligible === false) {
            state.candidateSinceMs = state.candidateLap = null;
            state.resetTimestamp = state.resetRaceTime = state.resetCar = state.resetSinceMs = null;
            state.resetCurrentLap = null;
            if (state.active && state.invalidSinceMs === null) state.invalidSinceMs = now;
            return state;
        }
        if (now === null || !frame) return state;
        const timestamp = integer(frame.timestamp);
        // Replayed/untimestamped input cannot maintain freshness or advance entry debounce.
        if (timestamp === null || timestamp >= UINT32) return state;
        const currentLap = nonnegative(frame.currentLap), lap = integer(frame.lap);
        const rank = integer(frame.rank), raceTime = nonnegative(frame.raceTime), car = integer(frame.car);
        const hasPrevious = state.timestamp !== null;
        let reset = false;
        if (hasPrevious) {
            const direction = order(state.timestamp, timestamp);
            if (direction === 0) return state;
            if (direction < 0) {
                // An isolated old packet must not look like a new event. Require a
                // clock/lap or car restart and another ordered packet from that epoch.
                const sameNewCar = car !== null && car === state.resetCar && state.car !== null && car !== state.car;
                const clockContinues = raceTime !== null && state.resetRaceTime !== null
                    && raceTime > state.resetRaceTime && raceTime - state.resetRaceTime <= (now - state.resetSinceMs) / 1000 + 1;
                const lapContinues = currentLap !== null && state.resetCurrentLap !== null
                    && currentLap > state.resetCurrentLap && currentLap - state.resetCurrentLap <= (now - state.resetSinceMs) / 1000 + 1;
                const timingContinues = raceTime !== null && state.resetRaceTime !== null ? clockContinues : lapContinues;
                const followsReset = state.resetTimestamp !== null && order(state.resetTimestamp, timestamp) > 0
                    && distance(state.resetTimestamp, timestamp) <= now - state.resetSinceMs + 1000
                    && (state.resetCar === null || car === null || car === state.resetCar)
                    && (sameNewCar || (lap === 0 && timingContinues));
                if (followsReset) {
                    reset = true;
                    state.epochTimestamp = timestamp;
                    state.epochSinceMs = now;
                } else {
                    const clockRestart = lap === 0 && currentLap !== null && currentLap <= 1
                        && ((raceTime !== null && raceTime <= 1 && state.raceTime !== null && state.raceTime > raceTime + 1)
                            || (state.lap !== null && state.lap > 0 && state.currentLap !== null && state.currentLap > 1));
                    const carRestart = timestamp <= 1000 && car !== null && state.car !== null && car !== state.car;
                    if (clockRestart || carRestart) {
                        state.resetTimestamp = timestamp;
                        state.resetRaceTime = raceTime;
                        state.resetCurrentLap = currentLap;
                        state.resetCar = car;
                        state.resetSinceMs = now;
                    }
                    return state;
                }
            } else if (state.epochTimestamp !== null
                && distance(state.epochTimestamp, timestamp) > now - state.epochSinceMs + 1000) {
                // A delayed packet from the retired clock cannot jump the new
                // epoch forward. TimestampMS and nowMs are both milliseconds.
                return state;
            }
            reset = reset || (car !== null && state.car !== null && car !== state.car)
                || (raceTime !== null && state.raceTime !== null && raceTime < state.raceTime)
                || (lap !== null && state.lap !== null && lap < state.lap);
        }
        state.resetTimestamp = state.resetRaceTime = state.resetCar = state.resetSinceMs = null;
        state.resetCurrentLap = null;
        if (reset) clearEvidence(state);
        if (currentLap !== null && currentLap > 0) {
            state.invalidSinceMs = null;
            if (!state.active) {
                if (state.candidateSinceMs === null || currentLap < state.candidateLap) {
                    state.candidateSinceMs = now;
                } else if (currentLap > state.candidateLap && now - state.candidateSinceMs >= ENTRY_MS) {
                    state.active = true;
                }
                state.candidateLap = currentLap;
            }
        } else {
            state.candidateSinceMs = state.candidateLap = null;
            const rankedZero = currentLap === 0 && rank !== null && rank > 0;
            const rollover = currentLap === 0 && lap !== null && state.lap !== null && lap > state.lap;
            if (rankedZero) state.invalidSinceMs = null;
            // A newly completed lap grants rollover grace. A static historical
            // lap counter cannot hold a frozen zero open indefinitely.
            else if (state.active && (state.invalidSinceMs === null || rollover)) state.invalidSinceMs = now;
        }
        remember(state, timestamp, currentLap, lap, raceTime, car, now);
        return state;
    }

    function createMotion(initialExpanded = false) {
        const expanded = initialExpanded === true;
        return { progress: expanded ? 1 : 0, velocity: 0, settled: true, target: expanded, lastNowMs: null };
    }
    function advanceMotion(motion, targetBoolean, nowMs, reducedMotion = false) {
        const previousNow = motion.lastNowMs;
        const now = monotonic(motion, nowMs);
        const nextTarget = targetBoolean === true;
        if (reducedMotion === true) {
            motion.progress = nextTarget ? 1 : 0;
            motion.velocity = 0;
            motion.target = nextTarget;
            motion.settled = true;
            return motion;
        }
        if (!motion.settled && previousNow !== null && now !== null && now > previousNow) {
            // Exact critically damped solution, independent of RAF cadence. Evolve
            // the old target up to this event, then retarget without a position or
            // velocity jump. Full travel settles in approximately 600 ms.
            const seconds = (now - previousNow) / 1000, omega = 14;
            const endpoint = motion.target ? 1 : 0;
            const displacement = motion.progress - endpoint;
            const coefficient = motion.velocity + omega * displacement;
            const decay = Math.exp(-omega * seconds);
            motion.progress = Math.max(0, Math.min(1, endpoint + (displacement + coefficient * seconds) * decay));
            motion.velocity = (motion.velocity - omega * coefficient * seconds) * decay;
            if (Math.abs(motion.progress - endpoint) <= .003 && Math.abs(motion.velocity) <= .04) {
                motion.progress = endpoint;
                motion.velocity = 0;
                motion.settled = true;
            }
        }
        if (nextTarget !== motion.target) {
            motion.target = nextTarget;
            motion.settled = motion.progress === (nextTarget ? 1 : 0) && motion.velocity === 0;
        }
        return motion;
    }
    root.LfaExpansion = { ENTRY_MS, TIMING_GRACE_MS, STALE_MS, createRace, ingestRace, confirmed, target, layoutPolicy, createMotion, advanceMotion };
})(typeof window === 'undefined' ? globalThis : window);
