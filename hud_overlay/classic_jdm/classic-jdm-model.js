/**
 * hud_overlay/classic_jdm/classic-jdm-model.js
 * Classic JDM 核心純函數數學計算模型 (Zero-Allocation 60Hz 高頻合約)
 */
(function (root) {
    'use strict';

    // ── 常數定義 ──────────────────────────────────────────────
    var PI = Math.PI;
    var DEG2RAD = PI / 180;
    var RAD2DEG = 180 / PI;

    // Defi 標準 270 度小錶弧形幾何 (135° ~ 405°)
    var GAUGE_START_RAD = 0.75 * PI; // 135°
    var GAUGE_SWEEP_RAD = 1.5 * PI;  // 270°

    // TRD 轉速錶弧形幾何 (140° ~ 400°)
    var TRD_START_RAD = (140 * PI) / 180;
    var TRD_SWEEP_RAD = (260 * PI) / 180;

    // 預先配置靜態幾何實體 (Zero-Allocation)
    var GEOMETRY_TRIPLE = Object.freeze({ width: 800, height: 440, scaleMultiplier: 1.0 });
    var GEOMETRY_DUAL   = Object.freeze({ width: 540, height: 300, scaleMultiplier: 1.0 });

    // 內部靜態重用槽位 (Zero-Allocation Fallback)
    var _defaultAuxOut = {
        label: '',
        unit: '',
        value: 0,
        minVal: 0,
        maxVal: 0,
        ratio: 0,
        angle: 0
    };

    var _defaultGearOut = {
        char: '-',
        rawGear: 0
    };

    // ── 輔助計算純函數 ──────────────────────────────────────────
    function clamp(val, min, max) {
        return val < min ? min : (val > max ? max : val);
    }

    function finiteNumber(val, fallback) {
        var n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    // ── 1. 多功能小錶解析 (resolveAuxGauge) ──────────────────────
    /**
     * 解析多功能小錶數據與指針角度 (支援 9 大模式與 Zero-Allocation)
     * @param {string} gaugeType 儀表類型 ('tire_temp_4w' | 'tire_temp_rear' | 'tire_temp_front' | 'susp_travel_4w' | 'susp_travel_front' | 'susp_travel_rear' | 'slip_ratio_4w' | 'oil_temp' | 'oil_press' | 'turbo' | 'boost')
     * @param {object} data 遙測數據影格
     * @param {boolean} isMetric 是否為公制單位 (預設 true)
     * @param {object} [out] 可選重用輸出物件 (若提供則零物件配置)
     * @returns {object} { label, unit, value, minVal, maxVal, ratio, angle }
     */
    function resolveAuxGauge(gaugeType, data, isMetric, out) {
        var res = out || _defaultAuxOut;
        var tm = data || {};
        var metric = isMetric !== false;

        // 提取輪胎溫度陣列 (預設 4 輪 0°F)
        var temps = tm.TireTemp || tm.tire_temp_f || [
            finiteNumber(tm.temp_fl, 0),
            finiteNumber(tm.temp_fr, 0),
            finiteNumber(tm.temp_rl, 0),
            finiteNumber(tm.temp_rr, 0)
        ];

        // 提取懸吊行程陣列 (0.0~1.0)
        var susp = tm.NormalizedSuspensionTravel || [
            finiteNumber(tm.susp_fl, 0),
            finiteNumber(tm.susp_fr, 0),
            finiteNumber(tm.susp_rl, 0),
            finiteNumber(tm.susp_rr, 0)
        ];

        // 提取滑移率陣列
        var slips = tm.TireSlipRatio || [
            finiteNumber(tm.slip_fl, 0),
            finiteNumber(tm.slip_fr, 0),
            finiteNumber(tm.slip_rl, 0),
            finiteNumber(tm.slip_rr, 0)
        ];

        var val = 0;
        var min = 0;
        var max = 100;
        var unit = '';
        var label = '';
        var ratio = 0;

        switch (gaugeType) {
            case 'tire_temp_rear': {
                label = 'TIRE RR';
                var rAvgF = (finiteNumber(temps[2], 0) + finiteNumber(temps[3], 0)) * 0.5;
                if (metric) {
                    val = (rAvgF - 32) * 5 / 9;
                    min = 20; max = 140; unit = '°C';
                } else {
                    val = rAvgF;
                    min = 70; max = 280; unit = '°F';
                }
                ratio = (val - min) / (max - min);
                break;
            }

            case 'tire_temp_front': {
                label = 'TIRE FR';
                var fAvgF = (finiteNumber(temps[0], 0) + finiteNumber(temps[1], 0)) * 0.5;
                if (metric) {
                    val = (fAvgF - 32) * 5 / 9;
                    min = 20; max = 140; unit = '°C';
                } else {
                    val = fAvgF;
                    min = 70; max = 280; unit = '°F';
                }
                ratio = (val - min) / (max - min);
                break;
            }

            case 'susp_travel_4w': {
                label = 'SUSP 4W';
                var s4Avg = (finiteNumber(susp[0], 0) + finiteNumber(susp[1], 0) +
                             finiteNumber(susp[2], 0) + finiteNumber(susp[3], 0)) * 0.25;
                val = s4Avg * 100;
                min = 0; max = 100; unit = '%';
                ratio = val / 100;
                break;
            }

            case 'susp_travel_front': {
                label = 'SUSP FR';
                var sfAvg = (finiteNumber(susp[0], 0) + finiteNumber(susp[1], 0)) * 0.5;
                val = sfAvg * 100;
                min = 0; max = 100; unit = '%';
                ratio = val / 100;
                break;
            }

            case 'susp_travel_rear': {
                label = 'SUSP RR';
                var srAvg = (finiteNumber(susp[2], 0) + finiteNumber(susp[3], 0)) * 0.5;
                val = srAvg * 100;
                min = 0; max = 100; unit = '%';
                ratio = val / 100;
                break;
            }

            case 'slip_ratio_4w': {
                label = 'SLIP 4W';
                var slipAvg = (Math.abs(finiteNumber(slips[0], 0)) + Math.abs(finiteNumber(slips[1], 0)) +
                               Math.abs(finiteNumber(slips[2], 0)) + Math.abs(finiteNumber(slips[3], 0))) * 0.25;
                val = slipAvg * 100;
                min = 0; max = 100; unit = '%';
                ratio = val / 100;
                break;
            }

            case 'oil_temp': {
                label = 'OIL TEMP';
                var rawOt = tm.OilTemp !== undefined ? tm.OilTemp : (tm.oil_temp !== undefined ? tm.oil_temp : null);
                var otF, otC;
                if (rawOt === null || !Number.isFinite(Number(rawOt))) {
                    otC = 90;
                    otF = 194;
                } else {
                    var nOt = Number(rawOt);
                    if (nOt > 140) {
                        otF = nOt;
                        otC = (nOt - 32) * 5 / 9;
                    } else {
                        otC = nOt;
                        otF = nOt * 9 / 5 + 32;
                    }
                }
                if (metric) {
                    val = otC;
                    min = 50; max = 150; unit = '°C';
                    ratio = (val - 50) / 100;
                } else {
                    val = otF;
                    min = 120; max = 300; unit = '°F';
                    ratio = (val - 120) / 180;
                }
                break;
            }

            case 'oil_press': {
                label = 'OIL PRESS';
                var rawOp = tm.OilPressure !== undefined ? tm.OilPressure : (tm.oil_pressure !== undefined ? tm.oil_pressure : null);
                var opBar = rawOp === null || !Number.isFinite(Number(rawOp)) ? 4.5 : Number(rawOp);
                if (metric) {
                    val = opBar;
                    min = 0; max = 10; unit = 'bar';
                    ratio = val / 10;
                } else {
                    val = opBar * 14.5038;
                    min = 0; max = 145; unit = 'PSI';
                    ratio = val / 145;
                }
                break;
            }

            case 'turbo':
            case 'boost': {
                label = 'TURBO';
                var rawB = tm.boost_bar !== undefined ? tm.boost_bar : (tm.Boost !== undefined ? tm.Boost / 14.5038 : 0);
                var bBar = finiteNumber(rawB, 0);
                // 負壓 (-1~0) 佔 35%，正壓 (0~2) 佔 65%
                if (bBar <= 0) {
                    ratio = ((clamp(bBar, -1.0, 0) + 1.0) / 1.0) * 0.35;
                } else {
                    ratio = 0.35 + (clamp(bBar, 0, 2.0) / 2.0) * 0.65;
                }
                if (metric) {
                    val = bBar;
                    min = -1.0; max = 2.0; unit = 'bar';
                } else {
                    val = bBar * 14.5038;
                    min = -15; max = 30; unit = 'PSI';
                }
                break;
            }

            case 'tire_temp_4w':
            default: {
                label = 'TIRE 4W';
                var t4AvgF = (finiteNumber(temps[0], 0) + finiteNumber(temps[1], 0) +
                              finiteNumber(temps[2], 0) + finiteNumber(temps[3], 0)) * 0.25;
                if (metric) {
                    val = (t4AvgF - 32) * 5 / 9;
                    min = 20; max = 140; unit = '°C';
                } else {
                    val = t4AvgF;
                    min = 70; max = 280; unit = '°F';
                }
                ratio = (val - min) / (max - min);
                break;
            }
        }

        var clampedRatio = clamp(Number.isFinite(ratio) ? ratio : 0, 0, 1);
        var angle = GAUGE_START_RAD + clampedRatio * GAUGE_SWEEP_RAD;

        res.label = label;
        res.unit = unit;
        res.value = val;
        res.minVal = min;
        res.maxVal = max;
        res.ratio = clampedRatio;
        res.angle = angle;

        return res;
    }

    // ── 2. 七段數碼管檔位格式化 (format7SegmentGear) ────────────
    /**
     * 格式化檔位顯示
     * @param {number|string} gear 檔位輸入 (0=R, 11=N, 1~10)
     * @param {object} [out] 可選輸出物件
     * @returns {object} { char: 'R'|'N'|'1'..'10'|'-', rawGear: number }
     */
    function format7SegmentGear(gear, out) {
        var res = out || _defaultGearOut;
        var raw = gear;

        if (raw === 'R' || raw === 'r' || raw === 0 || raw === '0') {
            res.char = 'R';
            res.rawGear = 0;
            return res;
        }
        if (raw === 'N' || raw === 'n' || raw === 11 || raw === '11') {
            res.char = 'N';
            res.rawGear = 11;
            return res;
        }

        var num = Number(raw);
        if (Number.isFinite(num) && num >= 1 && num <= 10) {
            var intGear = Math.floor(num);
            res.char = String(intGear);
            res.rawGear = intGear;
            return res;
        }

        res.char = '-';
        res.rawGear = Number.isFinite(num) ? num : -1;
        return res;
    }

    // ── 3. 轉速指針角度計算 (calculateTachAngle) ───────────────
    function getTrdDialMaxRpm(telemetryMaxRpm) {
        var maxVal = Number(telemetryMaxRpm);
        if (!Number.isFinite(maxVal) || maxVal <= 0) return 11000;
        if (maxVal < 7000) return 9000;
        if (maxVal <= 11000) return 11000;
        return Math.ceil(maxVal / 1000) * 1000;
    }

    /**
     * 計算轉速錶指針弧度角
     * @param {number} rpm 當前轉速
     * @param {number} maxRpm 車輛引擎最高轉速
     * @param {string} tachStyle 'trd' | 'defi' (預設 'trd')
     * @returns {number} 角度 (radians)
     */
    function calculateTachAngle(rpm, maxRpm, tachStyle) {
        var style = tachStyle || 'trd';
        var curRpm = finiteNumber(rpm, 0);
        var telMax = finiteNumber(maxRpm, 11000);

        if (style === 'defi') {
            // Defi Advance BF 線性刻度 (0 ~ 11,000 RPM 或自適應上限)
            var dialMax = telMax <= 11000 ? 11000 : Math.ceil(telMax / 1000) * 1000;
            var boundedRpm = clamp(curRpm, 0, dialMax);
            var ratio = boundedRpm / dialMax;
            return GAUGE_START_RAD + ratio * GAUGE_SWEEP_RAD;
        }

        // TRD 11,000 RPM 非線性壓縮刻度
        var trdDialMax = getTrdDialMaxRpm(telMax);
        var bounded = clamp(curRpm, 0, trdDialMax);
        var trdRatio;

        if (telMax < 7000) {
            // 0~2000 RPM 佔 18%，2000~9000 RPM 佔 82%
            if (bounded <= 2000) {
                trdRatio = (bounded / 2000) * 0.18;
            } else {
                trdRatio = 0.18 + ((bounded - 2000) / 7000) * 0.82;
            }
        } else if (telMax <= 11000) {
            // 經典 TRD: 0~3000 (18%), 3000~7000 (38%), 7000~11000 (44%)
            if (bounded <= 3000) {
                trdRatio = (bounded / 3000) * 0.18;
            } else if (bounded <= 7000) {
                trdRatio = 0.18 + ((bounded - 3000) / 4000) * 0.38;
            } else {
                trdRatio = 0.56 + ((bounded - 7000) / 4000) * 0.44;
            }
        } else {
            // 超出 11k: 0~3000 (18%), 3000~dialMax (82%)
            if (bounded <= 3000) {
                trdRatio = (bounded / 3000) * 0.18;
            } else {
                trdRatio = 0.18 + ((bounded - 3000) / (trdDialMax - 3000)) * 0.82;
            }
        }

        return TRD_START_RAD + trdRatio * TRD_SWEEP_RAD;
    }

    // ── 4. 時速指針角度計算 (calculateSpeedAngle) ───────────────
    /**
     * 計算時速錶指針弧度角 (0-200 km/h 或 0-140 mph 街機象限映射)
     */
    function calculateSpeedAngle(speed, isMetric, timeMs, enableJitter) {
        var val = finiteNumber(speed, 0);
        var metric = isMetric !== false;
        var maxSpd = metric ? 200 : 140;
        var baseAngleDeg;

        if (metric) {
            // 0 km/h: 150°, 20: 180°, 80: 270°, 140: 360°, 200: 450° (1.5° / km/h)
            if (val <= 0) {
                baseAngleDeg = 150;
            } else if (val <= maxSpd) {
                baseAngleDeg = 150 + val * 1.5;
            } else {
                var overtravel = Math.min(5.0, (val - maxSpd) * 0.15 + 2.5);
                baseAngleDeg = 450 + overtravel;
                if (enableJitter) {
                    var t = (finiteNumber(timeMs, 0) || 0) / 1000;
                    baseAngleDeg += Math.sin(t * 105) * 0.65 + Math.sin(t * 188 + 1.3) * 0.45;
                }
            }
        } else {
            // 0 mph: 135°, 20: 180°, 60: 270°, 100: 360°, 140: 450° (2.25° / mph)
            if (val <= 0) {
                baseAngleDeg = 135;
            } else if (val <= maxSpd) {
                baseAngleDeg = 135 + val * 2.25;
            } else {
                var overMph = Math.min(5.0, (val - maxSpd) * 0.15 + 2.5);
                baseAngleDeg = 450 + overMph;
                if (enableJitter) {
                    var tm = (finiteNumber(timeMs, 0) || 0) / 1000;
                    baseAngleDeg += Math.sin(tm * 105) * 0.65 + Math.sin(tm * 188 + 1.3) * 0.45;
                }
            }
        }

        return baseAngleDeg * DEG2RAD;
    }

    // ── 5. 掃表開機動畫補間 (calculateSweepProgress) ────────────
    /**
     * 計算同步開機掃表進度比率 (0.0 -> 1.0 -> 0.0)
     */
    function calculateSweepProgress(elapsedMs, totalDurationMs) {
        var duration = totalDurationMs || 1200;
        var t = clamp(finiteNumber(elapsedMs, 0), 0, duration);
        var p = t / duration;

        if (p < 0.45) {
            // 往上掃表 (0 -> 1)
            var progressUp = p / 0.45;
            return Math.sin(progressUp * PI * 0.5);
        } else if (p < 0.55) {
            // 頂點保持 (1.0)
            return 1.0;
        } else {
            // 回落 (1 -> 0)
            var progressDn = (p - 0.55) / 0.45;
            return 1.0 - Math.sin(progressDn * PI * 0.5);
        }
    }

    // ── 6. 容器幾何尺寸 (getContainerGeometry) ───────────────────
    /**
     * 取得 Arcade Arc 容器幾何尺寸
     * @param {boolean} showTriple 是否開啟三聯小錶
     * @returns {object} { width, height, scaleMultiplier }
     */
    function getContainerGeometry(showTriple) {
        return showTriple !== false ? GEOMETRY_TRIPLE : GEOMETRY_DUAL;
    }

    // ── 導出模組 ────────────────────────────────────────────────
    var ClassicJdmModel = {
        resolveAuxGauge: resolveAuxGauge,
        format7SegmentGear: format7SegmentGear,
        calculateTachAngle: calculateTachAngle,
        calculateSpeedAngle: calculateSpeedAngle,
        calculateSweepProgress: calculateSweepProgress,
        getContainerGeometry: getContainerGeometry,
        getTrdDialMaxRpm: getTrdDialMaxRpm,
        GEOMETRY_TRIPLE: GEOMETRY_TRIPLE,
        GEOMETRY_DUAL: GEOMETRY_DUAL
    };

    root.ClassicJdmModel = ClassicJdmModel;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ClassicJdmModel;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
