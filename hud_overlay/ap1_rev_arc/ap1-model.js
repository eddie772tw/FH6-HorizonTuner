/**
 * Honda S2000 AP1 (ID4Motion Digital Cluster) Pure Domain Model
 *
 * [設計決策紀錄 / Design Decision Note]
 * 1. 水溫 (Water Temp): 由於 Forza UDP 遙測未提供引擎水溫欄位，統一使用四輪平均胎溫 (TireTemp) 轉換為攝氏溫度驅動 C..H 水溫條。
 * 2. 增壓 kPa 與四輪平均胎溫 °C 由共用遙測契約直接讀取。
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

  function calculateRedlineRpm(maxRpm) {
    var maximum = Number(maxRpm);
    return Math.max(0, (Number.isFinite(maximum) && maximum > 0 ? maximum : 9000) - 2000);
  }

  function isVtecActive(rpm) {
    var r = Number(rpm);
    return Number.isFinite(r) && r >= VTEC_ENGAGE_RPM;
  }

  function calculateWaterTempRatio(tempC) {
    var t = Number(tempC);
    if (!Number.isFinite(t)) return 0.5;
    return clamp((t - 50) / 80, 0, 1);
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

  // Source timestamp progression, not repeated Coordinator RAF frames, proves freshness.
  var STALE_AFTER_MS = 1500;
  function createSignalState() {
    var timestamp = null;
    var lastTimestamp = null;
    var lastProgressAt = -Infinity;
    var error = false;
    var paused = false;
    var destroyed = false;
    return {
      receive: function(data, payload, now) {
        if (destroyed) return;
        data = data || {};
        payload = payload || {};
        var supplied = data.timestamp_ms ?? data.TimestampMS;
        timestamp = typeof supplied === 'number' && Number.isFinite(supplied) && supplied >= 0 ? supplied : null;
        error = data.success === false || payload.success === false || Boolean(data.error);
        var raceOn = data.isRaceOn ?? data.is_race_on ?? data.IsRaceOn;
        paused = raceOn === 0 || raceOn === false;
        if (timestamp !== null && timestamp !== lastTimestamp) {
          lastTimestamp = timestamp;
          lastProgressAt = now;
        }
      },
      snapshot: function(now) {
        var status = destroyed ? 'OFFLINE'
          : error ? 'DATA ERROR'
          : paused ? 'SESSION PAUSED'
          : timestamp === null ? 'WAITING FOR DATA'
          : now - lastProgressAt >= STALE_AFTER_MS ? 'SIGNAL LOST'
          : '';
        return { live: status === '', status: status };
      },
      destroy: function() { destroyed = true; }
    };
  }

  function calculateSweepProgress(elapsedMs, durationMs) {
    var dur = durationMs > 0 ? durationMs : 1200;
    var p = clamp((Number(elapsedMs) || 0) / dur, 0, 1);
    return Math.sin(p * Math.PI);
  }

  return {
    STALE_AFTER_MS: STALE_AFTER_MS,
    createSignalState: createSignalState,
    MAX_SCALE_RPM: MAX_SCALE_RPM,
    VTEC_ENGAGE_RPM: VTEC_ENGAGE_RPM,
    formatGear: formatGear,
    calculateRpmRatio: calculateRpmRatio,
    isVtecActive: isVtecActive,
    calculateRedlineRpm: calculateRedlineRpm,
    calculateWaterTempRatio: calculateWaterTempRatio,
    resolveFuelRatio: resolveFuelRatio,
    calculateSweepProgress: calculateSweepProgress
  };
});
