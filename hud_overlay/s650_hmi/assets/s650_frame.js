/* S650 frame state, config normalization and animation lifecycle. */
(function (window) {
    'use strict';

    function createFrameController(options) {
        var contract = options.contract;
        var tokens = options.tokens;
        var layouts = options.layouts;
        var canvas = options.canvas;
        var ctx = options.ctx;
        var container = options.container;
        var width = contract.canvas.width;
        var height = contract.canvas.height;
        var isReady = Boolean(canvas && ctx);

        var state = {
            theme: 'normal',
            driveMode: 'normal',
            matchDriveMode: false,
            isMetric: true,
            showGauge: true,
            showSpeed: true,
            showGear: true,
            showRPM: true,
            sweepActive: false,
            sweepPending: false,
            lastRenderTime: 0,
            lastFrame: Object.assign({}, contract.defaultFrame)
        };

        function hasValue(payload, key) {
            return payload && typeof payload === 'object' && (
                payload[key] !== undefined ||
                (payload.data && typeof payload.data === 'object' && payload.data[key] !== undefined)
            );
        }

        function readValue(payload, key) {
            if (!payload || typeof payload !== 'object') return undefined;
            if (payload[key] !== undefined) return payload[key];
            if (payload.data && typeof payload.data === 'object') return payload.data[key];
            return undefined;
        }

        function updateElementVisibility(elements) {
            if (!elements || typeof elements !== 'object') return;
            if (elements.showGauge !== undefined) state.showGauge = elements.showGauge !== false;
            if (elements.showSpeed !== undefined) state.showSpeed = elements.showSpeed !== false;
            if (elements.showGear !== undefined) state.showGear = elements.showGear !== false;
            if (elements.showRPM !== undefined) state.showRPM = elements.showRPM !== false;
            if (container && elements.showGauge !== undefined) {
                container.style.display = state.showGauge ? 'block' : 'none';
            }
        }

        function updateStateFromPayload(payload) {
            if (!payload || typeof payload !== 'object') return;

            if (hasValue(payload, 's650Theme') || hasValue(payload, 'clusterTheme')) {
                state.theme = contract.normalizeConfig(payload).theme;
            }
            if (hasValue(payload, 'driveMode') || hasValue(payload, 'drive_mode')) {
                state.driveMode = contract.normalizeConfig(payload).driveMode;
            }
            if (hasValue(payload, 'matchDriveMode')) {
                state.matchDriveMode = readValue(payload, 'matchDriveMode') === true;
            }
            if (hasValue(payload, 'isMetric') || hasValue(payload, 'metric') || hasValue(payload, 'unit')) {
                state.isMetric = contract.normalizeConfig(payload).isMetric;
            }
            if (hasValue(payload, 'elements')) {
                updateElementVisibility(contract.normalizeConfig(payload).elements);
            }
        }

        function getSpeed(data) {
            var frame = data || {};
            var canonical = state.isMetric ? frame.speed_kmh : frame.speed_mph;
            if (canonical !== undefined && canonical !== null) {
                return Math.max(0, contract.finiteNumber(canonical, 0));
            }
            if (frame.speed !== undefined && frame.speed !== null) {
                return Math.max(0, contract.finiteNumber(frame.speed, 0));
            }
            return 0;
        }

        function getRpm(data) {
            return Math.max(0, contract.finiteNumber(data && data.rpm, 0));
        }

        function getMaxRpm(data) {
            return Math.max(1, contract.finiteNumber(data && data.maxRpm, 8000));
        }

        function getGearLabel(data) {
            var rawGear = data && data.gear;
            if (rawGear === undefined || rawGear === null || rawGear === '') return '--';
            var gear = Number(rawGear);
            if (!Number.isFinite(gear) || gear < 0) return '--';
            if (gear === 0) return 'R';
            if (gear === 11) return 'N';
            return String(gear);
        }

        function getPedalValue(data, key) {
            var value = data && data[key];
            if (value !== undefined && value !== null && value !== '') {
                return contract.clamp(contract.finiteNumber(value, 0), 0, 1);
            }
            return 0;
        }

        var view = {
            width: width,
            gauge: contract.canvas.gauge,
            grid: tokens.grid.overlay,
            touch: tokens.touch,
            typography: tokens.typography,
            colors: tokens.colors,
            ergonomics: tokens.ergonomics,
            get theme() { return state.theme; },
            get isMetric() { return state.isMetric; },
            get showSpeed() { return state.showSpeed; },
            get showGear() { return state.showGear; },
            get showRPM() { return state.showRPM; },
            getSpeed: getSpeed,
            getRpm: getRpm,
            getMaxRpm: getMaxRpm,
            getGearLabel: getGearLabel,
            getPedalValue: getPedalValue,
            roundedSpeed: function (data) { return Math.round(getSpeed(data)); },
            unitLabel: function () { return state.isMetric ? 'KM/H' : 'MPH'; }
        };

        function render(data, payload, renderTime) {
            if (!isReady || !state.showGauge) return;

            var frame = contract.normalizeFrame(data, payload);
            var maxRpm = getMaxRpm(frame);
            var redlineRatio = contract.clamp(frame.redlineRpm / maxRpm, 0, 1);
            state.lastRenderTime = renderTime || 0;
            layouts.render(state.theme, frame, tokens.paletteFor(state.theme), redlineRatio);
        }

        function triggerSweep() {
            if (!isReady || state.sweepActive || !state.showGauge) return;
            state.sweepActive = true;
            var startedAt = performance.now();
            var duration = 1200;
            var maxRpm = getMaxRpm(state.lastFrame);
            var redline = contract.normalizeFrame(state.lastFrame, null).redlineRpm;

            function animate(now) {
                var progress = contract.clamp((now - startedAt) / duration, 0, 1);
                var rpm;
                if (progress < 0.5) {
                    rpm = maxRpm * Math.sin((progress / 0.5) * Math.PI / 2);
                } else {
                    var downProgress = (progress - 0.5) / 0.5;
                    rpm = maxRpm * (1 - Math.sin(downProgress * Math.PI / 2)) + 900 * Math.sin(downProgress * Math.PI / 2);
                }

                var sweepFrame = {
                    rpm: rpm,
                    maxRpm: maxRpm,
                    redlineRpm: redline,
                    speed_kmh: (rpm / maxRpm) * 160,
                    speed_mph: (rpm / maxRpm) * 99.4,
                    gear: 3,
                    throttle: progress < 0.5 ? progress * 2 : 0,
                    brake: progress >= 0.5 ? (progress - 0.5) * 2 : 0
                };
                render(sweepFrame, { redlineRpm: redline }, (now - startedAt) / 1000);

                if (progress < 1) {
                    window.requestAnimationFrame(animate);
                } else {
                    state.sweepActive = false;
                    render(state.lastFrame, null, 0);
                }
            }

            window.requestAnimationFrame(animate);
        }

        return {
            isReady: isReady,
            state: state,
            view: view,
            update: updateStateFromPayload,
            render: render,
            onInit: function (payload) {
                updateStateFromPayload(payload);
                if (isReady && state.showGauge && !state.sweepActive) render(state.lastFrame, payload, 0);
            },
            onElementsChange: function (elements) {
                updateElementVisibility(elements);
                if (state.showGauge && !state.sweepActive) render(state.lastFrame, null, 0);
            },
            onFrame: function (data, payload) {
                updateStateFromPayload(payload);
                state.lastFrame = contract.normalizeFrame(data, payload);
                if (!state.sweepActive && state.showGauge) render(state.lastFrame, payload, 0);
            },
            onAnimate: function () {
                if (isReady) {
                    triggerSweep();
                } else {
                    state.sweepPending = true;
                }
            },
            flushPendingAnimation: function () {
                if (!state.sweepPending) return;
                state.sweepPending = false;
                triggerSweep();
            },
            renderInitial: function () {
                if (isReady) render(state.lastFrame, null, 0);
            }
        };
    }

    window.S650HmiFrame = {
        create: createFrameController
    };
})(window);
