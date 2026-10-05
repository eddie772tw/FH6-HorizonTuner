/* 2.5-second page cadence is a HUD adaptation; the OEM manual specifies no such cadence. */
(function (root) {
    'use strict';
    const PHASE_MS = 2500, TIMING_GRACE_MS = 3000;
    function reset(s) {
        s.phase = 'info'; s.info = 'base'; s.nextInfo = 'timing'; s.until = null;
        s.alarmIndex = null; s.lastAlarm = -1; s.hadAlarm = false;
        s.pendingLap = null; s.popupLap = null; s.pendingIdentity = null; s.popupIdentity = null; s.noticeLap = null; s.awaitingLap = null; s.lapReplacesAlarm = false;
        s.protectAlarmReentry = false; s.resumeInfo = 'base'; s.resumeMs = PHASE_MS; s.protectedInfoUntil = null;
        s.baseline = false; s.lastLap = null; s.previousTimer = null; s.previousLap = null;
        s.timing = false; s.timerSeen = null;
    }
    function create() { const s = {}; reset(s); return s; }
    function ingest(s, f, now) {
        if (!s.baseline) {
            s.baseline = true; s.noticeLap = f.lap; s.lastLap = f.lastLap; s.previousTimer = f.currentLap; s.previousLap = f.lap; return;
        }
        const changedLap = f.lastLap !== null && s.lastLap !== null && Math.abs(f.lastLap - s.lastLap) > .000001;
        const counterStep = f.lap !== null && s.previousLap !== null && f.lap === s.previousLap + 1;
        const progress = f.currentLap !== null && s.previousTimer !== null && f.currentLap > s.previousTimer + .000001;
        if (progress) { s.timing = true; s.timerSeen = now; }
        else if (s.timing && (changedLap || counterStep)) s.timerSeen = now;
        if (f.lap !== null && s.previousLap !== null) {
            if (counterStep) {
                if (f.lastLap !== null) { queueLap(s, f.lastLap, f.lap); s.noticeLap = f.lap; s.awaitingLap = null; }
                else s.awaitingLap = f.lap;
            } else if (f.lap === s.awaitingLap && f.lastLap !== null) {
                queueLap(s, f.lastLap, f.lap); s.noticeLap = f.lap; s.awaitingLap = null;
            } else if (changedLap && f.lap === s.noticeLap) {
                // A delayed time correction belongs to the same completed lap, not a new event.
                if (s.pendingIdentity === f.lap) s.pendingLap = f.lastLap;
                if (s.popupIdentity === f.lap) s.popupLap = f.lastLap;
            }
        } else if (changedLap) queueLap(s, f.lastLap, null);
        if (f.lastLap !== null) s.lastLap = f.lastLap;
        s.previousTimer = f.currentLap; s.previousLap = f.lap;
    }
    function queueLap(s, value, identity) {
        if (s.phase === 'lap' && !s.hadAlarm && !s.lapReplacesAlarm) { s.popupLap = value; s.popupIdentity = identity; }
        else { s.pendingLap = value; s.pendingIdentity = identity; }
    }
    function startInfo(s, now) {
        s.phase = 'info'; s.info = s.nextInfo === 'timing' && s.timing ? 'timing' : 'base';
        s.nextInfo = s.info === 'base' && s.timing ? 'timing' : 'base';
        s.until = now + PHASE_MS; s.alarmIndex = null; s.popupLap = null; s.popupIdentity = null; s.protectAlarmReentry = s.hadAlarm;
    }
    function startAlarm(s, alarms, now, allowPopup) {
        if (allowPopup && s.pendingLap !== null) {
            s.phase = 'lap'; s.popupLap = s.pendingLap; s.popupIdentity = s.pendingIdentity; s.pendingLap = null; s.pendingIdentity = null; s.lapReplacesAlarm = true;
            s.alarmIndex = null; s.until = now + PHASE_MS; return;
        }
        for (let offset = 1; offset <= 3; offset++) {
            const index = (s.lastAlarm + offset) % 3;
            if (alarms[index].active) {
                s.phase = 'alarm'; s.alarmIndex = index; s.lastAlarm = index; s.until = now + PHASE_MS; s.popupLap = null; s.popupIdentity = null; return;
            }
        }
        startInfo(s, now);
    }
    function showPopup(s, now) {
        s.resumeInfo = s.info;
        s.resumeMs = Math.max(0, s.until - now);
        s.phase = 'lap'; s.popupLap = s.pendingLap; s.popupIdentity = s.pendingIdentity; s.pendingLap = null; s.pendingIdentity = null; s.lapReplacesAlarm = false;
        s.alarmIndex = null; s.until = now + PHASE_MS;
    }
    function advance(s, alarms, now) {
        if (s.timing && now - s.timerSeen >= TIMING_GRACE_MS) {
            s.timing = false;
            if (s.info === 'timing') s.info = 'base';
            if (s.resumeInfo === 'timing') s.resumeInfo = 'base';
        }
        if (s.until === null) s.until = now + PHASE_MS;
        const active = alarms[0].active || alarms[1].active || alarms[2].active;
        if (active && !s.hadAlarm) {
            s.hadAlarm = true;
            if (!(s.phase === 'info' && s.protectAlarmReentry && now < s.until)) { startAlarm(s, alarms, now, false); return; }
        }
        if (!active && s.hadAlarm && s.phase === 'alarm') startInfo(s, now);
        s.hadAlarm = active;
        if (s.phase === 'alarm' && !alarms[s.alarmIndex].active) {
            const deadline = s.until; startAlarm(s, alarms, now, false); s.until = deadline;
        }
        if (now >= s.until) {
            if (s.phase === 'alarm' || (s.phase === 'lap' && s.lapReplacesAlarm)) startInfo(s, now);
            else if (s.phase === 'lap') {
                if (s.resumeMs > 0) {
                    s.phase = 'info'; s.info = s.resumeInfo; s.until = now + s.resumeMs; s.popupLap = null; s.popupIdentity = null;
                } else startInfo(s, now);
                s.protectedInfoUntil = s.until;
            } else if (active) startAlarm(s, alarms, now, true);
            else startInfo(s, now);
        }
        if (!active && s.pendingLap !== null && s.phase === 'info' && (s.protectedInfoUntil === null || now >= s.protectedInfoUntil)) showPopup(s, now);
    }
    root.StackSchedule = { PHASE_MS, TIMING_GRACE_MS, create, reset, ingest, advance };
})(typeof window === 'undefined' ? globalThis : window);
