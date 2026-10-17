/**
 * Honda S2000 AP1 (ID4Motion Digital Cluster) Pure Domain Model
 *
 * [設計決策紀錄 / Design Decision Note]
 * 1. 水溫 (Water Temp): 由於 Forza UDP 遙測未提供引擎水溫欄位，統一使用四輪平均胎溫 (TireTemp) 轉換為攝氏溫度驅動 C..H 水溫條。
 * 2. 機油壓力 (Oil Pressure kPa) 與機油溫度 (Oil Temp °C): 採用確定性熱力學與油壓代理模型 (Deterministic Proxy Model)，
 *    依據轉速比例 (rpmRatio) 與油門開度 (throttle) 計算平滑且具物理合理性的數值。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Ap1Model = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_SCALE_RPM = 11000;
  var VTEC_ENGAGE_RPM = 6000;

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function formatGear(gear) {
    if (gear === 0 || gear === 'R') return 'R';
    if (gear === 11 || gear === 'N') return 'N';
    var num = Number(gear);
    if (Number.isInteger(num) && num >= 1 && num <= 10) {
      return String(num);
    }
    return 'N';
  }

  function calculateRpmRatio(rpm, maxScaleRpm) {
    var scale = maxScaleRpm > 0 ? maxScaleRpm : MAX_SCALE_RPM;
    var r = Number(rpm);
    if (!Number.isFinite(r) || r <= 0) return 0;
    return clamp(r / scale, 0, 1);
  }

  function isVtecActive(rpm) {
    var r = Number(rpm);
    return Number.isFinite(r) && r >= VTEC_ENGAGE_RPM;
  }

  function resolveWaterTempFromTireTemp(data) {
    if (!data || typeof data !== 'object') return 87;
    if (data.temp_fl !== undefined) {
      var fl = Number(data.temp_fl) || 0;
      var fr = Number(data.temp_fr !== undefined ? data.temp_fr : fl);
      var rl = Number(data.temp_rl !== undefined ? data.temp_rl : fl);
      var rr = Number(data.temp_rr !== undefined ? data.temp_rr : fl);
      var avg = (fl + fr + rl + rr) * 0.25;
      if (avg > 0) {
        var tempC = avg > 125 ? (avg - 32) * (5 / 9) : avg;
        return clamp(tempC, 40, 130);
      }
    }
    if (Array.isArray(data.TireTemp) && data.TireTemp.length >= 4) {
      var sum =
        (Number(data.TireTemp[0]) || 0) +
        (Number(data.TireTemp[1]) || 0) +
        (Number(data.TireTemp[2]) || 0) +
        (Number(data.TireTemp[3]) || 0);
      var avgF = sum * 0.25;
      if (avgF > 0) {
        var c = avgF > 125 ? (avgF - 32) * (5 / 9) : avgF;
        return clamp(c, 40, 130);
      }
    }
    if (data.coolant_temp !== undefined && Number.isFinite(Number(data.coolant_temp))) {
      return clamp(Number(data.coolant_temp), 40, 130);
    }
    return 87;
  }

  function calculateWaterTempRatio(tempC) {
    var t = Number(tempC);
    if (!Number.isFinite(t)) return 0.5;
    return clamp((t - 40) / 85, 0, 1);
  }

  function resolveFuelRatio(data) {
    if (!data || typeof data !== 'object') return 0.75;
    if (data.fuel_ratio !== undefined && Number.isFinite(Number(data.fuel_ratio))) {
      return clamp(Number(data.fuel_ratio), 0, 1);
    }
    if (data.fuel_level !== undefined && Number.isFinite(Number(data.fuel_level))) {
      return clamp(Number(data.fuel_level), 0, 1);
    }
    if (data.Fuel !== undefined && Number.isFinite(Number(data.Fuel))) {
      var f = Number(data.Fuel);
      return clamp(f > 1 ? f / 100 : f, 0, 1);
    }
    return 0.75;
  }

  function calculateOilVitalsProxy(rpm, maxRpm, throttle, waterTempC) {
    var scale = maxRpm > 1000 ? Number(maxRpm) : 9000;
    var rpmRatio = clamp((Number(rpm) || 0) / scale, 0, 1);
    var thr = clamp(Number(throttle) || 0, 0, 1);
    var baseTemp = Number.isFinite(Number(waterTempC)) ? Number(waterTempC) : 87;
    // Deterministic proxy: oil pressure in kPa (displayed as bar*10 or kPa/10 class on ID4Motion: 20..85)
    var oilPress = Math.round(clamp(18 + rpmRatio * 56 + thr * 8, 15, 95));
    // Deterministic proxy: oil temp in °C tracks water temp + load thermal delta
    var oilTemp = Math.round(clamp(baseTemp + 4 + rpmRatio * 14 + thr * 4, 50, 145));
    return {
      oilPress: oilPress,
      oilTemp: oilTemp
    };
  }

  function calculateSweepProgress(elapsedMs, durationMs) {
    var dur = durationMs > 0 ? durationMs : 1200;
    var p = clamp((Number(elapsedMs) || 0) / dur, 0, 1);
    return Math.sin(p * Math.PI);
  }

  return {
    MAX_SCALE_RPM: MAX_SCALE_RPM,
    VTEC_ENGAGE_RPM: VTEC_ENGAGE_RPM,
    formatGear: formatGear,
    calculateRpmRatio: calculateRpmRatio,
    isVtecActive: isVtecActive,
    resolveWaterTempFromTireTemp: resolveWaterTempFromTireTemp,
    calculateWaterTempRatio: calculateWaterTempRatio,
    resolveFuelRatio: resolveFuelRatio,
    calculateOilVitalsProxy: calculateOilVitalsProxy,
    calculateSweepProgress: calculateSweepProgress
  };
});
