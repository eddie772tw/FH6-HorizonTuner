(function (root) {
    'use strict';

    // ==========================================
    // 1. Initial D / TRD Tachometer Model (Dynamic Scale & Redline)
    // ==========================================
    var DEFAULT_MAX_RPM = 11000;

    function getDialMaxRpm(telemetryMaxRpm) {
        var maxVal = Number(telemetryMaxRpm);
        if (!Number.isFinite(maxVal) || maxVal <= 0) return 11000;
        if (maxVal < 7000) return 9000;
        if (maxVal <= 11000) return 11000;
        return Math.ceil(maxVal / 1000) * 1000;
    }

    function getTachAngle(rpm, telemetryMaxRpm) {
        var value = Number(rpm);
        if (!Number.isFinite(value)) value = 0;

        var telMax = Number(telemetryMaxRpm);
        if (!Number.isFinite(telMax) || telMax <= 0) {
            telMax = DEFAULT_MAX_RPM;
        }

        var dialMax = getDialMaxRpm(telMax);
        var bounded = Math.max(0, Math.min(dialMax, value));

        var ratio;
        if (telMax < 7000) {
            // < 7k: Compression segment is 0~2000 RPM (18% of 260° span)
            // 2000 ~ 9000 RPM occupies remaining 82%
            if (bounded <= 2000) {
                ratio = (bounded / 2000) * 0.18;
            } else {
                ratio = 0.18 + ((bounded - 2000) / 7000) * 0.82;
            }
        } else if (telMax <= 11000) {
            // 7k ~ 11k: Original TRD dial: 0~3000 (18%), 3~7k (38%), 7~11k (44%)
            if (bounded <= 3000) {
                ratio = (bounded / 3000) * 0.18;
            } else if (bounded <= 7000) {
                ratio = 0.18 + ((bounded - 3000) / 4000) * 0.38;
            } else {
                ratio = 0.56 + ((bounded - 7000) / 4000) * 0.44;
            }
        } else {
            // > 11k: 0~3000 RPM (18%), 3000 ~ dialMax (82%)
            if (bounded <= 3000) {
                ratio = (bounded / 3000) * 0.18;
            } else {
                ratio = 0.18 + ((bounded - 3000) / (dialMax - 3000)) * 0.82;
            }
        }

        return ((140 + ratio * 260) * Math.PI) / 180;
    }

    function getTachTicks(telemetryMaxRpm) {
        var telMax = Number(telemetryMaxRpm);
        if (!Number.isFinite(telMax) || telMax <= 0) {
            telMax = DEFAULT_MAX_RPM;
        }

        var dialMax = getDialMaxRpm(telMax);
        var redlineThreshold = telMax - 1500;
        var ticks = [];

        for (var r = 0; r <= dialMax; r += 500) {
            var isMajor = (r % 1000 === 0);
            var angle = getTachAngle(r, telMax);
            var isRed = (r >= redlineThreshold);

            ticks.push({
                rpm: r,
                angle: angle,
                isMajor: isMajor,
                label: isMajor ? String(r / 1000) : null,
                isRed: isRed
            });
        }
        return ticks;
    }

    function getWarningLevel(rpm, redline) {
        var red = Number(redline) || 10000;
        if (rpm >= Math.min(10500, red * 0.99)) return 2;
        if (rpm >= Math.min(9800, red * 0.96)) return 1;
        return 0;
    }

    root.InitialDTachModel = {
        getAngle: getTachAngle,
        getDialMaxRpm: getDialMaxRpm,
        getTicks: getTachTicks,
        getWarningLevel: getWarningLevel,
        maxRpm: DEFAULT_MAX_RPM
    };

    // ==========================================
    // 2. Initial D / TRD Speedometer Model
    // ==========================================
    // KM/H configuration: 0-200 km/h, step 20
    // Quadrant anchors: 20 -> 180° (Left), 80 -> 270° (Top), 140 -> 360° (Right), 200 -> 450° (Bottom)
    // 20 to 200 spans 270° (1.5° / km/h). 0 km/h is at 150° (8 o'clock).
    var METRIC_MAX_SPEED = 200;
    var METRIC_STEP = 20;

    // MPH configuration: 0-140 mph, step 20
    // Quadrant anchors: 20 -> 180° (Left), 60 -> 270° (Top), 100 -> 360° (Right), 140 -> 450° (Bottom)
    // 20 to 140 spans 270° (2.25° / mph). 0 mph is at 135° (7:30 o'clock).
    var IMPERIAL_MAX_SPEED = 140;
    var IMPERIAL_STEP = 20;

    // Alternative 200 MPH racing dial configuration (matching real TRD gauge photos)
    var IMPERIAL_200_MAX_SPEED = 200;

    function getSpeedTicks(isMetric, use200MphDial) {
        var isMetricMode = isMetric !== false;
        var maxSpd = isMetricMode
            ? METRIC_MAX_SPEED
            : (use200MphDial ? IMPERIAL_200_MAX_SPEED : IMPERIAL_MAX_SPEED);
        var step = isMetricMode ? METRIC_STEP : IMPERIAL_STEP;
        var subStep = step / 2;
        var ticks = [];

        for (var s = 0; s <= maxSpd; s += subStep) {
            var isMajor = s % step === 0;
            var angle = getSpeedAngle(s, isMetricMode, 0, false, use200MphDial);
            ticks.push({
                speed: s,
                angle: angle,
                isMajor: isMajor,
                label: isMajor ? String(s) : null
            });
        }
        return ticks;
    }

    function getSpeedAngle(speed, isMetric, timeMs, enableJitter, use200MphDial) {
        var value = Number(speed);
        if (!Number.isFinite(value)) value = 0;
        var isMetricMode = isMetric !== false;
        var maxSpd = isMetricMode
            ? METRIC_MAX_SPEED
            : (use200MphDial ? IMPERIAL_200_MAX_SPEED : IMPERIAL_MAX_SPEED);

        var baseAngleDeg;
        if (isMetricMode || use200MphDial) {
            // Metric: 20 km/h is 180°, 80 km/h is 270°, 140 km/h is 360°, 200 km/h is 450°
            // Slope: 90° / 60 km/h = 1.5° / km/h. At 0 km/h: 150°.
            if (value <= 0) {
                baseAngleDeg = 150;
            } else if (value <= maxSpd) {
                baseAngleDeg = 150 + value * 1.5;
            } else {
                // Exceeding 200 km/h: slightly exceed 200 tick (over-travel to peg)
                var overtravel = Math.min(5.0, (value - maxSpd) * 0.15 + 2.5);
                baseAngleDeg = 450 + overtravel;

                // Simulated damping jitter at peg
                if (enableJitter !== false) {
                    var t = (Number.isFinite(timeMs) && timeMs > 0 ? timeMs : (typeof performance !== 'undefined' ? performance.now() : 0)) / 1000;
                    var jitter = Math.sin(t * 105) * 0.65 + Math.sin(t * 188 + 1.3) * 0.45;
                    baseAngleDeg += jitter;
                }
            }
        } else {
            // Imperial (0-140 MPH): 20 mph is 180°, 60 mph is 270°, 100 mph is 360°, 140 mph is 450°
            // Slope: 90° / 40 mph = 2.25° / mph. At 0 mph: 135°.
            if (value <= 0) {
                baseAngleDeg = 135;
            } else if (value <= maxSpd) {
                baseAngleDeg = 135 + value * 2.25;
            } else {
                var overtravelMph = Math.min(5.0, (value - maxSpd) * 0.15 + 2.5);
                baseAngleDeg = 450 + overtravelMph;

                if (enableJitter !== false) {
                    var tMph = (Number.isFinite(timeMs) && timeMs > 0 ? timeMs : (typeof performance !== 'undefined' ? performance.now() : 0)) / 1000;
                    var jitterMph = Math.sin(tMph * 105) * 0.65 + Math.sin(tMph * 188 + 1.3) * 0.45;
                    baseAngleDeg += jitterMph;
                }
            }
        }

        return (baseAngleDeg * Math.PI) / 180;
    }

    root.InitialDSpeedModel = {
        getAngle: getSpeedAngle,
        getTicks: getSpeedTicks,
        metricMaxSpeed: METRIC_MAX_SPEED,
        imperialMaxSpeed: IMPERIAL_MAX_SPEED
    };

})(typeof window !== 'undefined' ? window : globalThis);
