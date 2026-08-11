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
            theme: 'heritage67',
            centerWidget: 'drive',
            guiThemeMode: 'dark',
            showCenterInfo: true,
            isMetric: true,
            showGauge: true,
            showSpeed: true,
            showGear: true,
            showRPM: true,
            customColor: '#00f0ff',
            useDefaultColors: true,
            sweepActive: false,
            sweepPending: false,
            gearCarouselPosition: null,
            gearCarouselStart: 0,
            gearCarouselTarget: 0,
            gearCarouselStartedAt: 0,
            heritageGaugeMaximums: { power: 1000, boost: 30 },
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
            if (elements.showCenterInfo !== undefined) state.showCenterInfo = elements.showCenterInfo !== false;
            if (container && elements.showGauge !== undefined) {
                container.style.display = state.showGauge ? 'block' : 'none';
            }
        }

        function updateStateFromPayload(payload) {
            if (!payload || typeof payload !== 'object') return;

            if (hasValue(payload, 's650Theme') || hasValue(payload, 'clusterTheme')) {
                state.theme = contract.normalizeConfig(payload).theme;
            }
            if (hasValue(payload, 's650CenterWidget') || hasValue(payload, 'centerWidget')) {
                state.centerWidget = contract.normalizeConfig(payload).centerWidget;
            }
            if (hasValue(payload, 's650GuiThemeMode')) {
                state.guiThemeMode = contract.normalizeConfig(payload).guiThemeMode;
            }
            if (hasValue(payload, 'isMetric') || hasValue(payload, 'metric') || hasValue(payload, 'unit')) {
                state.isMetric = contract.normalizeConfig(payload).isMetric;
            }
            if (hasValue(payload, 'elements')) {
                updateElementVisibility(contract.normalizeConfig(payload).elements);
            }
            if (hasValue(payload, 'customColor')) {
                var customColor = readValue(payload, 'customColor');
                if (typeof customColor === 'string') state.customColor = customColor;
            }
            if (hasValue(payload, 'useDefaultColors')) {
                state.useDefaultColors = readValue(payload, 'useDefaultColors') !== false;
            }
        }

        function getSpeed(data) {
            var frame = data || {};
            var canonical = state.isMetric ? frame.speed_kmh : frame.speed_mph;
            return Math.max(0, contract.finiteNumber(canonical, 0));
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

        function getGearCarousel(data) {
            var rawGear = Number(data && data.gear);
            var now = performance.now();
            var duration = 180;
            // Forza emits neutral while quick-shifting; ignore it so it never
            // interrupts the R–10 carousel transition.
            if (Number.isFinite(rawGear) && rawGear >= 0 && rawGear <= 10) {
                if (state.gearCarouselPosition === null) {
                    state.gearCarouselPosition = rawGear;
                    state.gearCarouselStart = rawGear;
                    state.gearCarouselTarget = rawGear;
                } else if (rawGear !== state.gearCarouselTarget) {
                    var current = getGearCarouselPosition(now, duration);
                    state.gearCarouselPosition = current;
                    state.gearCarouselStart = current;
                    state.gearCarouselTarget = rawGear;
                    state.gearCarouselStartedAt = now;
                }
            }
            return getGearCarouselPosition(now, duration);
        }

        function getGearCarouselPosition(now, duration) {
            if (state.gearCarouselPosition === null) return 0;
            if (!state.gearCarouselStartedAt) return state.gearCarouselTarget;
            var progress = contract.clamp((now - state.gearCarouselStartedAt) / duration, 0, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var position = state.gearCarouselStart + (state.gearCarouselTarget - state.gearCarouselStart) * eased;
            if (progress === 1) {
                state.gearCarouselPosition = state.gearCarouselTarget;
                state.gearCarouselStartedAt = 0;
            }
            return position;
        }

        function getPedalValue(data, key) {
            var value = data && data[key];
            if (value !== undefined && value !== null && value !== '') {
                return contract.clamp(contract.finiteNumber(value, 0), 0, 1);
            }
            return 0;
        }

        function getFuelLevel(data) {
            var fuel = contract.finiteNumber(data && data.fuel_ratio, -1);
            if (fuel < 0) return null;
            return contract.clamp(fuel, 0, 1);
        }

        var _tireTempCache = [null, null, null, null];
        function getTireTemperatures(data) {
            var source = data || {};
            var temperatures = Array.isArray(source.tire_temp_f) ? source.tire_temp_f : null;

            for (var i = 0; i < 4; i++) {
                var rawValue = temperatures ? temperatures[i] : null;
                var value = contract.finiteNumber(rawValue, 0);
                _tireTempCache[i] = value > 0 ? value : null;
            }
            return _tireTempCache;
        }

        function formatTireTemperature(value) {
            if (value === null || value === undefined) return '--';
            var displayed = state.isMetric ? (value - 32) * 5 / 9 : value;
            return String(Math.round(displayed));
        }

        function getTelemetryReadout(slot, data) {
            var frame = data || {};
            var headingNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            var distanceMeters;
            var yaw;
            var degrees;
            var horsepower;
            var boost;

            switch (slot) {
            case 'odometer':
                distanceMeters = contract.finiteNumber(frame.distance_m, 0);
                if (state.isMetric) return { value: (distanceMeters / 1000).toFixed(1), unit: 'km', ratio: null };
                return { value: (distanceMeters / 1609.344).toFixed(1), unit: 'mi', ratio: null };
            case 'heading':
                yaw = contract.finiteNumber(frame.heading_deg, 0);
                degrees = yaw;
                degrees = ((degrees % 360) + 360) % 360;
                return { value: headingNames[Math.round(degrees / 45) % 8], unit: '', ratio: null };
            case 'rpm':
                return { value: String(Math.round(getRpm(frame))), unit: 'RPM', ratio: contract.clamp(getRpm(frame) / getMaxRpm(frame), 0, 1) };
            case 'speed':
                return { value: String(Math.round(getSpeed(frame))), unit: state.isMetric ? 'KM/H' : 'MPH', ratio: null };
            case 'power':
                horsepower = Math.max(0, contract.finiteNumber(frame.power_hp, 0));
                if (horsepower > state.heritageGaugeMaximums.power) state.heritageGaugeMaximums.power = Math.ceil(horsepower / 50) * 50;
                return { value: String(Math.round(horsepower)), unit: 'HP', ratio: contract.clamp(horsepower / state.heritageGaugeMaximums.power, 0, 1), min: '0', max: String(state.heritageGaugeMaximums.power) };
            case 'boost':
                boost = Math.max(0, contract.finiteNumber(frame.boost_psi, 0));
                if (boost > state.heritageGaugeMaximums.boost) state.heritageGaugeMaximums.boost = Math.ceil(boost);
                return { value: boost.toFixed(1), unit: 'PSI', ratio: contract.clamp(boost / state.heritageGaugeMaximums.boost, 0, 1), min: '0', max: String(state.heritageGaugeMaximums.boost) };
            default:
                return { value: '--', unit: '', ratio: null };
            }
        }

        function updateContainerYOffset(payload) {
            if (!container) return;
            var offset = contract.clamp(
                contract.finiteNumber(readValue(payload, 's650HmiOffsetY'), 0),
                -300,
                300
            );
            // This is intentionally applied to the outer container only. The
            // Canvas coordinate system and all Normal/Heritage component
            // positions remain unchanged by the calibration offset.
            container.style.transform = 'translateY(' + offset + 'px)';
        }

        var view = {
            width: width,
            height: height,
            gauge: contract.canvas.gauge,
            grid: tokens.grid.overlay,
            touch: tokens.touch,
            typography: tokens.typography,
            colors: tokens.colors,
            ergonomics: tokens.ergonomics,
            get theme() { return state.theme; },
            get isMetric() { return state.isMetric; },
            get centerWidget() { return state.centerWidget; },
            get foxbodyNightMode() { return state.guiThemeMode === 'dark'; },
            get showCenterInfo() { return state.showCenterInfo; },
            get showSpeed() { return state.showSpeed; },
            get showGear() { return state.showGear; },
            get showRPM() { return state.showRPM; },
            getSpeed: getSpeed,
            getRpm: getRpm,
            getMaxRpm: getMaxRpm,
            getGearLabel: getGearLabel,
            getGearCarousel: getGearCarousel,
            getPedalValue: getPedalValue,
            getFuelLevel: getFuelLevel,
            getTireTemperatures: getTireTemperatures,
            formatTireTemperature: formatTireTemperature,
            getTelemetryReadout: getTelemetryReadout,
            tireTemperatureUnit: function () { return state.isMetric ? '°C' : '°F'; },
            roundedSpeed: function (data) { return Math.round(getSpeed(data)); },
            unitLabel: function () { return state.isMetric ? 'KM/H' : 'MPH'; }
        };

        function render(data, renderTime) {
            if (!isReady || !state.showGauge) return;

            var frame = data || state.lastFrame;
            var maxRpm = getMaxRpm(frame);
            var redlineRatio = contract.clamp(frame.redlineRpm / maxRpm, 0, 1);
            state.lastRenderTime = renderTime || 0;
            layouts.render(state.theme, frame, tokens.paletteFor(state.theme, {
                customColor: state.customColor,
                useDefaultColors: state.useDefaultColors,
                guiThemeMode: state.guiThemeMode
            }), redlineRatio);
        }

        function triggerSweep() {
            if (!isReady || state.sweepActive || !state.showGauge) return;
            state.sweepActive = true;
            var startedAt = performance.now();
            var duration = 1200;
            var maxRpm = getMaxRpm(state.lastFrame);
            var redline = state.lastFrame.redlineRpm;

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
                render(sweepFrame, (now - startedAt) / 1000);

                if (progress < 1) {
                    window.requestAnimationFrame(animate);
                } else {
                    state.sweepActive = false;
                    render(state.lastFrame, 0);
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
                updateContainerYOffset(payload);
                updateStateFromPayload(payload);
                if (isReady && state.showGauge && !state.sweepActive) render(state.lastFrame, 0);
            },
            onElementsChange: function (elements) {
                updateElementVisibility(elements);
                if (state.showGauge && !state.sweepActive) render(state.lastFrame, 0);
            },
            onFrame: function (data, payload) {
                updateStateFromPayload(payload);
                state.lastFrame = contract.normalizeFrame(data);
                if (!state.sweepActive && state.showGauge) render(state.lastFrame, 0);
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
            if (isReady) render(state.lastFrame, 0);
            }
        };
    }

    window.S650HmiFrame = {
        create: createFrameController
    };
})(window);
