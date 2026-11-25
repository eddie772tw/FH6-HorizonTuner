type DisplayData = Record<string, unknown>;
type Translate = (label: string) => string;

const labels: Record<string, string> = {
  carName: 'Vehicle', carId: 'Vehicle ID', carClass: 'Car class', performanceIndex: 'Performance index',
  weight: 'Weight', weight_distribution: 'Front weight distribution', maxHp: 'Peak power', maxTorque: 'Max Torque',
  induction: 'Induction Type', drivetrain: 'Drivetrain', tireType: 'Tire Compound', isElectric: 'Electric vehicle',
  frontTireWidth: 'Front tire width (mm)', rearTireWidth: 'Rear tire width (mm)',
  frontTireAspect: 'Front tire aspect (%)', rearTireAspect: 'Rear tire aspect (%)',
  frontTireRim: 'Front rim (in)', rearTireRim: 'Rear rim (in)', mechBalance: 'Mechanical balance',
  aeroEfficiency: 'Aero efficiency', aeroBalance: 'Aero balance',
  aero_downforce_front: 'Front downforce', aero_downforce_rear: 'Rear downforce',
  'adjustability.gears': 'Number of gears', 'adjustability.gearbox': 'Gearbox',
  'adjustability.suspension': 'Suspension', 'adjustability.brakes': 'Brakes',
  'adjustability.arb': 'Anti-roll bars', 'adjustability.aero': 'Aero', 'adjustability.diff': 'Differential',
  'engine.effectiveRedline': 'Measured effective redline', 'engine.peakPowerRpm': 'Measured peak power RPM',
  'engine.peakTorqueRpm': 'Measured peak torque RPM',
};

const units: Record<string, string> = {
  weight: 'kg', weight_distribution: '%', maxHp: 'hp', maxTorque: 'N·m',
  aero_downforce_front: 'kgf', aero_downforce_rear: 'kgf',
};
const enumLabels: Record<string, string> = {
  NA: 'Naturally aspirated', Full: 'Fully adjustable', FinalDrive: 'Final drive only', unknown: 'Unknown',
};

function object(value: unknown): value is DisplayData {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function fields(data: DisplayData): DisplayData {
  const rows: DisplayData = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'units' || key.startsWith('units.') || key.endsWith('Version')) continue;
    if (key === 'adjustability' && object(value)) {
      for (const [part, setting] of Object.entries(value)) rows['adjustability.' + part] = setting;
    } else if (value == null || ['number', 'string', 'boolean'].includes(typeof value) || (object(value) && 'value' in value)) {
      rows[key] = value;
    }
  }
  return rows;
}

function fieldLabel(key: string, t: Translate): string {
  const bound = /^(arb|height|spring)_(front|rear)_(min|max)$/.exec(key);
  if (bound) return fieldLabel(bound[1] + '.' + bound[2], t) + ' · ' + t(bound[3] === 'min' ? 'Minimum' : 'Maximum');
  if (labels[key]) return t(labels[key]);
  const localized = t(key);
  return localized !== key ? localized : key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/[._]/g, ' ').replace(/^\w/, char => char.toUpperCase());
}

function display(key: string, value: unknown, data: DisplayData, t: Translate): string {
  if (value === undefined) return '—';
  let unit = object(data.units) ? data.units[key] : data['units.' + key];
  if (object(value)) { unit = value.unit ?? unit; value = value.value; }
  if (value === null) return t('Unknown');
  if (typeof value === 'boolean' || value === 'true' || value === 'false') return t(value === true || value === 'true' ? 'Yes' : 'No');
  if (typeof value === 'string') {
    const measured = /^(-?\d+(?:\.\d+)?)\s+(slider|ratio|deg|psi|%|kgf\/mm|cm|kg|kgf|in|lb\/in)$/i.exec(value);
    if (measured) { value = Number(measured[1]); unit = measured[2]; }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const suffix = typeof unit === 'string' ? unit : units[key] ?? (key.startsWith('spring_') ? 'kgf/mm' : key.startsWith('height_') ? 'cm' : '');
    const label = { slider: '', ratio: '', deg: '°', psi: 'PSI' }[suffix.toLowerCase()] ?? suffix;
    return [Number(value.toFixed(3)).toString(), label].filter(Boolean).join(' ');
  }
  return typeof value === 'string' ? t(enumLabels[value] ?? value) : t('Unknown');
}

export function tuningRows(observed: DisplayData, recommended: DisplayData, t: Translate) {
  const left = fields(observed);
  const right = fields(recommended);
  const identity = ['carName', 'carClass', 'performanceIndex'].filter(key => key in left);
  return [...new Set([...identity, ...Object.keys(right), ...Object.keys(left)])].map(key => ({
    key, label: fieldLabel(key, t), observed: display(key, left[key], observed, t),
    recommended: display(key, right[key], recommended, t),
  }));
}
