// The HUD consumes /ws/telemetry JSON: preserved raw Boost is PSI above ambient.
// Never apply the unrelated binary/Pa assumption or guess units by magnitude.
export const PSI_PER_BAR = 14.5038;
export const KPA_PER_PSI = 6.89476;
export const BOOST_RANGE = Object.freeze({ minBar: -1, maxBar: 2 });
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const knownUnit = value => typeof value === 'string' && ['bar', 'psi', 'kpa'].includes(value.toLowerCase()) ? value.toLowerCase() : null;
const RAW_MARKERS = ['TimestampMS', 'CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'IsRaceOn', 'CarOrdinal'];
const toBar = (value, unit) => unit === 'psi' ? value / PSI_PER_BAR : unit === 'kpa' ? value / 100 : value;

export function selectedBoostUnit(data = {}, config = {}, speedUnit = 'kmh') {
  for (const candidate of [data.displayUnits?.boostPressure, data.boost_unit, config.effectiveUnits?.boostPressure, config.units?.boostPressure]) {
    const unit = knownUnit(candidate);
    if (unit) return unit;
  }
  return speedUnit === 'mph' ? 'psi' : 'bar';
}

function readBoost(data) {
  const reading = (value, unit) => ({ value, nativeUnit: unit, bar: toBar(value, unit) });
  if (own(data, 'Boost')) {
    const value = finite(data.Boost);
    return value === null ? null : reading(value, 'psi');
  }
  // Coordinator manufactures/clamps its aliases. When raw-frame markers are
  // present, an absent raw Boost must remain absent even if aliases say zero.
  if (RAW_MARKERS.some(key => own(data, key))) return null;
  for (const [key, unit] of [['boost_psi', 'psi'], ['boost_bar', 'bar'], ['boost_kpa', 'kpa']]) {
    const value = finite(data[key]);
    if (value !== null) return reading(value, unit);
  }
  const explicitUnit = own(data, 'boost_unit') ? knownUnit(data.boost_unit) : knownUnit(data.displayUnits?.boostPressure);
  const value = finite(data.boost);
  return explicitUnit && value !== null ? reading(value, explicitUnit) : null;
}

function numberText(value, unit) {
  const decimals = unit === 'bar' ? 2 : unit === 'psi' ? 1 : 0;
  const rounded = Number(value.toFixed(decimals));
  const fixed = (rounded === 0 ? 0 : rounded).toFixed(decimals);
  // Keep unusually large real readings visible without overflowing the panel.
  return fixed.length <= 7 ? fixed : value.toExponential(0);
}

export function emptyBoost(unit = 'bar') {
  return {
    bar: null, value: null, ratio: null, overflow: null, unit,
    unitLabel: unit === 'psi' ? 'PSI' : unit === 'kpa' ? 'kPa' : 'bar',
    valueText: '--', minLabel: unit === 'psi' ? '-14.5' : unit === 'kpa' ? '-100' : '-1',
    maxLabel: unit === 'psi' ? '+29' : unit === 'kpa' ? '+200' : '+2',
  };
}

export function normalizeBoost(data = {}, config = {}, speedUnit = 'kmh') {
  data = data && typeof data === 'object' ? data : {};
  config = config && typeof config === 'object' ? config : {};
  const unit = selectedBoostUnit(data, config, speedUnit);
  const display = emptyBoost(unit);
  const source = readBoost(data);
  if (source === null) return display;
  const { bar, value: nativeValue, nativeUnit } = source;
  let converted = nativeValue;
  if (unit !== nativeUnit) {
    converted = unit === 'bar' ? bar
      : unit === 'psi' ? (nativeUnit === 'kpa' ? nativeValue / KPA_PER_PSI : bar * PSI_PER_BAR)
        : nativeUnit === 'psi' ? nativeValue * KPA_PER_PSI : bar * 100;
  }
  const value = finite(converted);
  if (value === null) return display;
  return {
    ...display, bar, value,
    ratio: Math.max(0, Math.min(1, (bar - BOOST_RANGE.minBar) / (BOOST_RANGE.maxBar - BOOST_RANGE.minBar))),
    overflow: bar < BOOST_RANGE.minBar ? 'low' : bar > BOOST_RANGE.maxBar ? 'high' : null,
    valueText: numberText(value, unit),
  };
}
