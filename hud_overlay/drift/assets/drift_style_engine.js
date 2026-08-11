/*
 * Drift Style MVP domain engine.
 *
 * This module deliberately owns no DOM or Canvas code. It consumes the
 * already-normalized Drift HUD frame and exposes one stable state object for
 * a lightweight presentation layer. Keeping the state machine here makes the
 * scoring cadence independent from UDP packet cadence and straightforward to
 * cover with isolation tests.
 */
(function (window) {
    'use strict';

    var RANKS = [
        { threshold: 0, code: 'D', label: 'DRIFT!', decay: 2 },
        { threshold: 60, code: 'C', label: 'CRAZY!', decay: 4 },
        { threshold: 150, code: 'B', label: 'BRILLIANT!', decay: 7 },
        { threshold: 280, code: 'A', label: 'ASTONISHING!', decay: 11 },
        { threshold: 460, code: 'S', label: 'SEXY!', decay: 17 },
        { threshold: 680, code: 'SS', label: 'SUPER SEXY!', decay: 25 },
        { threshold: 940, code: 'SSS', label: 'SUPER SEXY STYLISH!', decay: 36 }
    ];

    var FLOW_EVENTS = {
        3: { label: 'CHASE', points: 7 },
        4: { label: 'SMOOTH', points: 11 },
        5: { label: 'LOCKED', points: 16 }
    };

    var RISK_EVENTS = {
        2: { label: 'EDGE', points: 10 },
        3: { label: 'RISK', points: 16 },
        4: { label: 'MAXIMUM', points: 22 }
    };

    var SPECIAL_EVENTS = {
        handbrake: { label: 'HANDBRAKE ENTRY', points: 15 },
        clutch_kick: { label: 'CLUTCH KICK', points: 20 }
    };

    var CONFIG = {
        maxScore: 1200,
        enterAngle: 12,
        sustainAngle: 6,
        entrySpeedKmh: 10,
        sustainSpeedKmh: 8,
        directionAngle: 4,
        switchConfirmMs: 160,
        switchGraceMs: 600,
        breakDelayMs: 900,
        flowPulseMs: 750,
        riskPulseMs: 1000,
        holdScorePulseMs: 1000,
        mergeWindowMs: 1100,
        eventTtlMs: 1300,
        summaryMs: 1600
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function emptyEvent(source) {
        return {
            source: source,
            label: '',
            level: 0,
            count: 0,
            seconds: 0,
            active: false,
            expiresAt: 0,
            lastPulseAt: -Infinity
        };
    }

    function createDriftStyleEngine() {
        var state = {
            mode: 'idle',
            score: 0,
            rankIndex: 0,
            rankCode: RANKS[0].code,
            rankLabel: RANKS[0].label,
            meterRatio: 0,
            runActive: false,
            direction: 0,
            transitionSince: 0,
            transitionStableMs: 0,
            transitionTarget: 0,
            inactiveMs: 0,
            flowPulseMs: 0,
            riskPulseMs: 0,
            holdScorePulseMs: 0,
            lastFlowLevel: 0,
            lastRiskLevel: 0,
            events: {
                flow: emptyEvent('flow'),
                hold: emptyEvent('hold'),
                risk: emptyEvent('risk')
            },
            special: {
                label: '',
                count: 0,
                points: 0,
                active: false,
                expiresAt: 0,
                lastPulseAt: -Infinity
            },
            pendingSpecial: {
                id: '',
                expiresAt: 0
            },
            peak: {
                flowLabel: '',
                flowLevel: 0,
                flowCount: 0,
                holdSeconds: 0,
                riskLabel: '',
                riskLevel: 0,
                riskCount: 0,
                specialLabel: '',
                specialCount: 0
            },
            summary: {
                active: false,
                until: 0,
                meterRatio: 0,
                rankCode: RANKS[0].code,
                rankLabel: RANKS[0].label,
                flowLabel: '',
                flowCount: 0,
                holdSeconds: 0,
                riskLabel: '',
                riskCount: 0,
                specialLabel: '',
                specialCount: 0
            }
        };
        var lastNow = 0;

        function updateRank() {
            var index = 0;
            for (var i = 1; i < RANKS.length; i += 1) {
                if (state.score >= RANKS[i].threshold) index = i;
                else break;
            }

            state.rankIndex = index;
            state.rankCode = RANKS[index].code;
            state.rankLabel = RANKS[index].label;

            var next = RANKS[index + 1];
            if (!next) {
                state.meterRatio = 1;
                return;
            }
            state.meterRatio = clamp(
                (state.score - RANKS[index].threshold) / (next.threshold - RANKS[index].threshold),
                0,
                1
            );
        }

        function resetPeak() {
            state.peak.flowLabel = '';
            state.peak.flowLevel = 0;
            state.peak.flowCount = 0;
            state.peak.holdSeconds = 0;
            state.peak.riskLabel = '';
            state.peak.riskLevel = 0;
            state.peak.riskCount = 0;
            state.peak.specialLabel = '';
            state.peak.specialCount = 0;
        }

        function clearEvent(event) {
            event.label = '';
            event.level = 0;
            event.count = 0;
            event.seconds = 0;
            event.active = false;
            event.expiresAt = 0;
            event.lastPulseAt = -Infinity;
        }

        function resetRun() {
            state.score = 0;
            state.runActive = false;
            state.direction = 0;
            state.transitionSince = 0;
            state.transitionStableMs = 0;
            state.transitionTarget = 0;
            state.inactiveMs = 0;
            state.flowPulseMs = 0;
            state.riskPulseMs = 0;
            state.holdScorePulseMs = 0;
            state.lastFlowLevel = 0;
            state.lastRiskLevel = 0;
            clearEvent(state.events.flow);
            clearEvent(state.events.hold);
            clearEvent(state.events.risk);
            state.special.label = '';
            state.special.count = 0;
            state.special.points = 0;
            state.special.active = false;
            state.special.expiresAt = 0;
            state.special.lastPulseAt = -Infinity;
            state.pendingSpecial.id = '';
            state.pendingSpecial.expiresAt = 0;
            resetPeak();
            updateRank();
        }

        function startRun(direction) {
            state.runActive = true;
            state.mode = 'active';
            state.direction = direction;
            state.inactiveMs = 0;
            state.transitionSince = 0;
            state.transitionStableMs = 0;
            state.transitionTarget = 0;
        }

        function addScore(points) {
            state.score = clamp(state.score + points, 0, CONFIG.maxScore);
        }

        function pulseEvent(event, label, level, now) {
            if (event.active && event.label === label && now - event.lastPulseAt <= CONFIG.mergeWindowMs) {
                event.count += 1;
            } else {
                event.label = label;
                event.level = level;
                event.count = 1;
            }
            event.active = true;
            event.expiresAt = now + CONFIG.eventTtlMs;
            event.lastPulseAt = now;
        }

        function triggerSpecialNow(event, now) {
            var special = state.special;
            if (special.active && special.label === event.label && now - special.lastPulseAt <= CONFIG.mergeWindowMs) {
                special.count += 1;
            } else {
                special.label = event.label;
                special.count = 1;
            }
            special.points = event.points;
            special.active = true;
            special.expiresAt = now + CONFIG.eventTtlMs;
            special.lastPulseAt = now;
            addScore(event.points);

            if (special.count > state.peak.specialCount) {
                state.peak.specialLabel = special.label;
                state.peak.specialCount = special.count;
            }
        }

        function consumePendingSpecial(now) {
            if (!state.pendingSpecial.id || now > state.pendingSpecial.expiresAt) return;
            var event = SPECIAL_EVENTS[state.pendingSpecial.id];
            state.pendingSpecial.id = '';
            state.pendingSpecial.expiresAt = 0;
            if (event) triggerSpecialNow(event, now);
        }

        function refreshHold(now, dtMs) {
            var hold = state.events.hold;
            hold.active = true;
            hold.label = 'HOLD';
            hold.seconds += dtMs / 1000;
            hold.expiresAt = now + CONFIG.eventTtlMs;
            if (hold.seconds > state.peak.holdSeconds) state.peak.holdSeconds = hold.seconds;

            state.holdScorePulseMs += dtMs;
            while (state.holdScorePulseMs >= CONFIG.holdScorePulseMs) {
                state.holdScorePulseMs -= CONFIG.holdScorePulseMs;
                addScore(6);
            }
        }

        function scoreFlow(flowLevel, now, dtMs) {
            var flow = FLOW_EVENTS[flowLevel];
            if (!flow) {
                state.lastFlowLevel = 0;
                state.flowPulseMs = 0;
                return;
            }

            if (state.lastFlowLevel !== flowLevel) {
                state.flowPulseMs = CONFIG.flowPulseMs;
                state.lastFlowLevel = flowLevel;
            } else {
                state.flowPulseMs += dtMs;
            }

            while (state.flowPulseMs >= CONFIG.flowPulseMs) {
                state.flowPulseMs -= CONFIG.flowPulseMs;
                pulseEvent(state.events.flow, flow.label, flowLevel, now);
                addScore(flow.points);
            }

            var current = state.events.flow;
            if (current.level > state.peak.flowLevel || (current.level === state.peak.flowLevel && current.count > state.peak.flowCount)) {
                state.peak.flowLabel = current.label;
                state.peak.flowLevel = current.level;
                state.peak.flowCount = current.count;
            }
        }

        function scoreRisk(riskLevel, now, dtMs) {
            var risk = RISK_EVENTS[riskLevel];
            if (!risk) {
                state.lastRiskLevel = 0;
                state.riskPulseMs = 0;
                return;
            }

            if (state.lastRiskLevel !== riskLevel) {
                state.riskPulseMs = CONFIG.riskPulseMs;
                state.lastRiskLevel = riskLevel;
            } else {
                state.riskPulseMs += dtMs;
            }

            while (state.riskPulseMs >= CONFIG.riskPulseMs) {
                state.riskPulseMs -= CONFIG.riskPulseMs;
                pulseEvent(state.events.risk, risk.label, riskLevel, now);
                addScore(risk.points);
            }

            var current = state.events.risk;
            if (current.level > state.peak.riskLevel || (current.level === state.peak.riskLevel && current.count > state.peak.riskCount)) {
                state.peak.riskLabel = current.label;
                state.peak.riskLevel = current.level;
                state.peak.riskCount = current.count;
            }
        }

        function expireEvents(now) {
            var events = state.events;
            if (!state.runActive && events.flow.active && now >= events.flow.expiresAt) clearEvent(events.flow);
            if (!state.runActive && events.hold.active && now >= events.hold.expiresAt) clearEvent(events.hold);
            if (!state.runActive && events.risk.active && now >= events.risk.expiresAt) clearEvent(events.risk);
            if (state.special.active && now >= state.special.expiresAt) state.special.active = false;
        }

        function finishRun(now) {
            if (!state.runActive) return;

            updateRank();
            state.summary.active = true;
            state.summary.until = now + CONFIG.summaryMs;
            state.summary.meterRatio = state.meterRatio;
            state.summary.rankCode = state.rankCode;
            state.summary.rankLabel = state.rankLabel;
            state.summary.flowLabel = state.peak.flowLabel;
            state.summary.flowCount = state.peak.flowCount;
            state.summary.holdSeconds = state.peak.holdSeconds;
            state.summary.riskLabel = state.peak.riskLabel;
            state.summary.riskCount = state.peak.riskCount;
            state.summary.specialLabel = state.peak.specialLabel;
            state.summary.specialCount = state.peak.specialCount;
            resetRun();
            state.mode = 'settling';
        }

        function updateDirection(angle, absAngle, now, dtMs) {
            var sign = absAngle >= CONFIG.directionAngle ? (angle < 0 ? -1 : 1) : 0;
            if (!sign || !state.direction || sign === state.direction) {
                state.transitionSince = 0;
                state.transitionStableMs = 0;
                state.transitionTarget = 0;
                if (state.runActive) state.mode = 'active';
                return;
            }

            if (state.transitionTarget !== sign) {
                state.transitionTarget = sign;
                state.transitionSince = now;
                state.transitionStableMs = 0;
                state.mode = 'transition';
            }

            state.transitionStableMs += dtMs;
            if (state.transitionStableMs >= CONFIG.switchConfirmMs) {
                state.direction = sign;
                state.transitionSince = 0;
                state.transitionStableMs = 0;
                state.transitionTarget = 0;
                state.mode = 'active';
            } else if (now - state.transitionSince > CONFIG.switchGraceMs) {
                // The grace period is visual state only. Combo termination still
                // relies on the longer sustained-loss rule below.
                state.mode = 'transition';
            }
        }

        function update(frame, now) {
            if (!Number.isFinite(now)) return state;
            if (!lastNow) {
                lastNow = now;
                updateRank();
                return state;
            }

            var dtMs = clamp(now - lastNow, 0, 100);
            lastNow = now;

            if (state.summary.active && now >= state.summary.until) state.summary.active = false;
            if (state.special.active && now >= state.special.expiresAt) state.special.active = false;

            var rankBefore = RANKS[state.rankIndex];
            state.score = Math.max(0, state.score - rankBefore.decay * (dtMs / 1000));

            var speed = Number(frame.speedKmh) || 0;
            var angle = Number(frame.angle) || 0;
            var absAngle = Math.abs(angle);
            var entersDrift = speed >= CONFIG.entrySpeedKmh && absAngle >= CONFIG.enterAngle;
            var sustainsDrift = speed >= CONFIG.sustainSpeedKmh && absAngle >= CONFIG.sustainAngle;

            if (!state.runActive) {
                if (entersDrift) {
                    startRun(angle < 0 ? -1 : 1);
                    consumePendingSpecial(now);
                }
                else {
                    expireEvents(now);
                    updateRank();
                    return state;
                }
            }

            if (!sustainsDrift) {
                state.inactiveMs += dtMs;
                if (state.inactiveMs >= CONFIG.breakDelayMs) {
                    finishRun(now);
                    return state;
                }
            } else {
                state.inactiveMs = 0;
            }

            updateDirection(angle, absAngle, now, dtMs);
            refreshHold(now, dtMs);
            scoreFlow(Number(frame.flowQuality) || 0, now, dtMs);
            scoreRisk(Number(frame.riskLevel) || 0, now, dtMs);
            updateRank();
            return state;
        }

        function reset() {
            resetRun();
            state.summary.active = false;
            state.mode = 'idle';
            lastNow = 0;
            return state;
        }

        return {
            update: update,
            triggerSpecial: function (id, now) {
                var event = SPECIAL_EVENTS[id];
                if (!event || !Number.isFinite(now)) return state;
                if (state.runActive) triggerSpecialNow(event, now);
                else {
                    state.pendingSpecial.id = id;
                    state.pendingSpecial.expiresAt = now + CONFIG.eventTtlMs;
                }
                updateRank();
                return state;
            },
            getState: function () { return state; },
            reset: reset,
            ranks: RANKS
        };
    }

    window.DriftStyleEngine = {
        create: createDriftStyleEngine,
        ranks: RANKS
    };
})(window);
