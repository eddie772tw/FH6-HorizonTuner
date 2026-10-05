import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const baseConfig = { hudStyle: 'r34_mfd', scale: 1, r34MfdMode: 'single', r34ShowCluster: true, r34Lighting: 'night',
  unit: 'kmh', effectiveUnits: { speed: 'kmh', boostPressure: 'bar', power: 'kw', torque: 'nm', temperature: 'C' }, enableSmoothing: true,
  useDefaultColors: true, glowIntensity: 1, elements: { showGauge: true, showRPM: true, showSpeed: true, showGear: true,
    showBoost: true, showCenterInfo: true, showPowerTorque: true, showTeleMaster: false, showMotionEffect: false,
    showTeleSuspension: false, showTeleTires: false, showTeleAttitude: false, showTelePedals: false, showTeleCompass: false } };
export const rawSample = { TimestampMS: 1000, IsRaceOn: 1, CarOrdinal: 34, CurrentEngineRpm: 6800, EngineMaxRpm: 9000,
  SpeedMetersPerSecond: 45, Gear: 4, Boost: 17.40456, Fuel: .62, AccelInput: 195, BrakeInput: 0,
  TireTemp: [195, 205, 215, 225], PowerWatts: 215000, TorqueNewtons: 405, AccelerationX: 5.2, AccelerationY: 0, AccelerationZ: 2.5,
  CurrentLap: 67.321, BestLap: 82.154, LastLap: 83.526, LapNumber: 3, CurrentRaceTime: 240, DistanceTraveled: 12008 };
export async function serve() {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.otf': 'font/otf' };
  const server = createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/api/overlay/config') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(baseConfig)); return; }
    if (name === '/api/hud/styles') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ styles: ['r34_mfd', 'simple'].map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) })); return; }
    try {
      const target = path.resolve(root, '.' + name.replace(/^\/hud(?=\/)/, ''));
      if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(target); res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
