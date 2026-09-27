// Keep only model channels. No position, account or track data is copied.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [sourceRoot, outputPath] = process.argv.slice(2);
if (!sourceRoot || !outputPath) throw new Error('Usage: node extract_ev_replay.mjs <runs-directory> <output-json>');
const names = [
  '20260927-093602-taycan-turbo-s-fd403-400-200-baseline-01-79cd8f',
  '20260927-095228-taycan-turbo-s-fd403-g2-220-validation-01-243ea1',
  '20260927-100110-taycan-turbo-s-fd403-g2-200-return-01-d6dcda',
];
const columns = ['TimestampMS', 'IsRaceOn', 'CarOrdinal', 'CarClass', 'CarPerformanceIndex',
  'EngineMaxRpm', 'EngineIdleRpm', 'CurrentEngineRpm', 'Gear', 'AccelInput', 'BrakeInput',
  'ClutchInput', 'HandBrakeInput', 'SteerInput', 'SpeedMetersPerSecond', 'PowerWatts',
  'TorqueNewtons', 'WheelRotationSpeed', 'TireSlipRatio'];
const runs = names.map((name, index) => {
  const raw = fs.readFileSync(path.join(sourceRoot, name, 'telemetry.ndjson'));
  const frames = raw.toString('utf8').trim().split(/\r?\n/).map(line => JSON.parse(line).frame);
  let lastKept = -Infinity;
  const rows = frames.filter(f => {
    // ~20 Hz, with all high-throttle zero-output frames retained.
    if (f.TimestampMS - lastKept < 45 && !(f.AccelInput >= 250 && f.PowerWatts === 0)) return false;
    lastKept = f.TimestampMS;
    return true;
  }).map(f => columns.map(key => f[key] ?? null));
  return { name, sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    finalDrive: 4.03, gearRatios: index === 1 ? [4, 2.2] : [4, 2], rows };
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ schema: 'ev-replay/v1', columns, runs }) + '\n');
console.log(runs.map(r => ({ run: r.name, samples: r.rows.length })));
