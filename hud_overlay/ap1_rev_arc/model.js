// Display-only boundary. Units/redline are supplied by the shared Coordinator.
export const STALE_AFTER_MS = 1500;
export const SEGMENT_COUNT = 60;
export const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = value => finite(value) !== null && value >= 0 ? value : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function gearLabel(value) {
  if (!Number.isInteger(value)) return '—';
  if (value === 0) return 'R';
  if (value === 11) return 'N';
  return value >= 1 && value <= 10 ? String(value) : '—';
}

export function speedUnit(data = {}, payload = {}, config = {}) {
  const selected = config.effectiveUnits?.speed ?? config.effectiveUnit;
  if (selected === 'kmh' || selected === 'mph') return selected;
  const supplied = data.displayUnits?.speed;
  if (supplied === 'kmh' || supplied === 'mph') return supplied;
  if (typeof payload.isMetric === 'boolean') return payload.isMetric ? 'kmh' : 'mph';
  if (config.unit === 'kmh' || config.unit === 'mph') return config.unit;
  return config.isMetric === false ? 'mph' : 'kmh';
}

export function normalizeFrame(data = {}, payload = {}, config = {}) {
  data = data && typeof data === 'object' ? data : {};
  payload = payload && typeof payload === 'object' ? payload : {};
  config = config && typeof config === 'object' ? config : {};
  const unit = speedUnit(data, payload, config);
  let speed = finite(unit === 'mph' ? data.speed_mph : data.speed_kmh);
  if (speed === null && data.displayUnits?.speed === unit) speed = finite(data.speed);
  // Reverse travel may be signed upstream; the gauge displays speed magnitude.
  if (speed !== null) speed = Math.abs(speed);
  // A three-digit display must not silently show a truncated/clamped measurement.
  const speedText = speed !== null && Math.round(speed) <= 999 ? String(Math.round(speed)) : '---';
  const rpm = nonnegative(data.rpm);
  const maximum = finite(data.maxRpm ?? data.max_rpm);
  const maxRpm = maximum !== null && maximum > 0 ? maximum : null;
  const redline = finite(payload.redlineRpm ?? data.redlineRpm);
  const redlineRpm = maxRpm !== null && redline !== null && redline > 0 && redline <= maxRpm ? redline : null;
  const fuel = finite(data.fuel_ratio);
  const fuelRatio = fuel !== null && fuel >= 0 && fuel <= 1 ? fuel : null;
  const timestamp = nonnegative(data.timestamp_ms ?? data.TimestampMS);
  return {
    speedText, unit, rpm, maxRpm, redlineRpm,
    rpmRatio: rpm !== null && maxRpm !== null ? clamp(rpm / maxRpm, 0, 1) : null,
    redlineRatio: redlineRpm !== null ? redlineRpm / maxRpm : null,
    shift: rpm !== null && redlineRpm !== null && rpm >= redlineRpm,
    gear: gearLabel(data.gear), fuelRatio, timestamp,
    error: data.success === false || payload.success === false || Boolean(data.error),
    paused: (data.isRaceOn ?? data.is_race_on ?? data.IsRaceOn) === 0 || (data.isRaceOn ?? data.is_race_on ?? data.IsRaceOn) === false,
  };
}

export function emptyFrame(unit = 'kmh', status = 'WAITING FOR DATA') {
  return { speedText: '---', gear: '—', unit, rpm: null, maxRpm: null, redlineRpm: null, rpmRatio: null, redlineRatio: null, fuelRatio: null, shift: false, status, live: false };
}

// Timestamp progression distinguishes real samples from Coordinator RAF replay.
export function createState() {
  let config = {};
  let data = {};
  let payload = {};
  let frame = normalizeFrame();
  let lastTimestamp = null;
  let lastProgressAt = -Infinity;
  let destroyed = false;
  return {
    configure(next = {}) {
      if (destroyed) return;
      config = { ...config, ...next };
      frame = normalizeFrame(data, payload, config);
    },
    receive(next = {}, meta = {}, now = 0) {
      if (destroyed) return;
      data = next;
      payload = meta;
      frame = normalizeFrame(data, payload, config);
      if (frame.timestamp !== null && frame.timestamp !== lastTimestamp) {
        lastTimestamp = frame.timestamp;
        lastProgressAt = now;
      }
    },
    snapshot(now = 0) {
      if (destroyed) return emptyFrame(frame.unit, 'OFFLINE');
      if (frame.error) return emptyFrame(frame.unit, 'DATA ERROR');
      if (frame.paused) return emptyFrame(frame.unit, 'SESSION PAUSED');
      if (frame.timestamp === null) return emptyFrame(frame.unit);
      if (now - lastProgressAt >= STALE_AFTER_MS) return emptyFrame(frame.unit, 'SIGNAL LOST');
      const partial = frame.speedText === '---' || frame.rpmRatio === null || frame.gear === '—';
      return { ...frame, live: true, status: partial ? 'PARTIAL DATA' : '' };
    },
    destroy() { destroyed = true; data = {}; payload = {}; lastProgressAt = -Infinity; },
  };
}

export function tachometerTicks(maxRpm) {
  if (maxRpm === null || maxRpm <= 0 || !Number.isFinite(maxRpm)) return [];
  // At most ten intervals, with readable numbers for both low/high-revving cars.
  const step = Math.max(1000, Math.ceil(maxRpm / 10000) * 1000);
  const ticks = [];
  for (let rpm = 0; rpm <= maxRpm; rpm += step) ticks.push({ ratio: rpm / maxRpm, label: String(rpm / 1000), rpm });
  return ticks;
}

export function segmentState(ratio, redlineRatio, count = SEGMENT_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    lit: ratio !== null && index < Math.ceil(clamp(ratio, 0, 1) * count),
    hot: redlineRatio !== null && (index + .5) / count >= redlineRatio,
  }));
}
